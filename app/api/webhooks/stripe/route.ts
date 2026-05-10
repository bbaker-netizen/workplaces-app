/**
 * Stripe webhook handler.
 *
 * Phase 2.2. Mirrors invoice lifecycle into our `invoices` table.
 * Subscription events (customer.subscription.created/updated/deleted)
 * are noted but don't yet drive any state change — Phase 2.2b will
 * add subscription_id tracking on engagements.
 *
 * Engagement linkage: every invoice we create from this app sets
 * `metadata.engagement_id`. The webhook reads that to resolve the
 * tenant before writing.
 *
 * Auth: signature verification via `STRIPE_WEBHOOK_SECRET`. Configure
 * the endpoint in https://dashboard.stripe.com/webhooks.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { engagements, invoices } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { mapInvoiceStatus, stripe } from "@/lib/integrations/stripe";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured." },
      { status: 500 },
    );
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Signature verification failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 401 },
    );
  }

  try {
    switch (event.type) {
      case "invoice.created":
      case "invoice.updated":
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_failed":
      case "invoice.voided":
        await upsertInvoiceFromStripe(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertSubscriptionOnEngagement(
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[stripe-webhook] handler failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

async function upsertInvoiceFromStripe(inv: Stripe.Invoice): Promise<void> {
  const engagementId = (inv.metadata?.engagement_id ?? "").trim();
  if (!engagementId) {
    console.warn(
      `[stripe-webhook] invoice ${inv.id} has no engagement_id metadata; skipping.`,
    );
    return;
  }

  const orgId = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({ orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    return eng?.orgId ?? null;
  });
  if (!orgId) {
    console.warn(
      `[stripe-webhook] engagement ${engagementId} not found; skipping invoice ${inv.id}.`,
    );
    return;
  }

  const status = mapInvoiceStatus(inv.status ?? "draft");
  const issuedAt =
    inv.status_transitions?.finalized_at ?? inv.created
      ? new Date((inv.status_transitions?.finalized_at ?? inv.created) * 1000)
      : null;
  const dueAt = inv.due_date ? new Date(inv.due_date * 1000) : null;
  const paidAt = inv.status_transitions?.paid_at
    ? new Date(inv.status_transitions.paid_at * 1000)
    : null;

  await withSystemContext(async (tx) => {
    const [existing] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.stripeInvoiceId, inv.id ?? ""))
      .limit(1);
    const values = {
      orgId,
      engagementId,
      stripeInvoiceId: inv.id,
      number: inv.number ?? null,
      description: inv.description ?? null,
      amountCents: inv.amount_due ?? 0,
      currency: (inv.currency ?? "cad").toUpperCase(),
      status,
      issuedAt,
      dueAt,
      paidAt,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    };
    if (existing) {
      await tx.update(invoices).set(values).where(eq(invoices.id, existing.id));
    } else {
      await tx.insert(invoices).values(values);
    }
  });
}

/**
 * Mirror subscription state onto the engagement row. The engagement
 * is resolved by `metadata.engagement_id` (set when the subscription
 * is created from the app) or — failing that — by `customer` matching
 * a stored `stripe_customer_id`.
 *
 * Status is normalized via the subscription's status string so the
 * UI can render canonical labels. Cancelled/incomplete trigger
 * clearing the active subscription_id for clarity.
 */
async function upsertSubscriptionOnEngagement(
  sub: Stripe.Subscription,
): Promise<void> {
  const metadataEngagementId =
    (sub.metadata?.engagement_id ?? "").trim() || null;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  if (!metadataEngagementId && !customerId) {
    console.warn(
      `[stripe-webhook] subscription ${sub.id} has no engagement_id metadata or customer; skipping.`,
    );
    return;
  }

  await withSystemContext(async (tx) => {
    let engagementId: string | null = null;
    if (metadataEngagementId) {
      const [eng] = await tx
        .select({ id: engagements.id })
        .from(engagements)
        .where(eq(engagements.id, metadataEngagementId))
        .limit(1);
      if (eng) engagementId = eng.id;
    }
    if (!engagementId && customerId) {
      const [eng] = await tx
        .select({ id: engagements.id })
        .from(engagements)
        .where(eq(engagements.stripeCustomerId, customerId))
        .limit(1);
      if (eng) engagementId = eng.id;
    }
    if (!engagementId) {
      console.warn(
        `[stripe-webhook] subscription ${sub.id} could not be matched to any engagement; skipping.`,
      );
      return;
    }
    const isActive =
      sub.status === "active" ||
      sub.status === "trialing" ||
      sub.status === "past_due";
    await tx
      .update(engagements)
      .set({
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: isActive ? sub.id : null,
      })
      .where(eq(engagements.id, engagementId));
  });
}
