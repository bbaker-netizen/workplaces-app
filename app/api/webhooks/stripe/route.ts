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
      // Subscription events — noted; tracking in engagements lands in
      // Phase 2.2b.
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
