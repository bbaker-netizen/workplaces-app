"use server";

/**
 * Invoices — provider-aware creation.
 *
 * Phase 4.6. Bruce uses QBO + QBO Payments as the primary billing
 * system; Stripe is kept available for the rare cases. The Coach
 * picks `provider: "qbo" | "stripe"` per invoice; QBO is the default.
 *
 * Both flows produce a row in our `invoices` table with the relevant
 * external id (qbo_invoice_id or stripe_invoice_id) so the portal UI
 * can render status uniformly.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  engagements,
  invoices,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  createCustomer,
  createInvoice as qboCreateInvoice,
  findCustomerByEmail,
  getValidQboCredentials,
  qboInvoicePaymentLink,
} from "@/lib/integrations/qbo";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  amountCents: z.number().int().min(1).max(10_000_000_00),
});

const createSchema = z.object({
  engagementId: z.string().uuid(),
  provider: z.enum(["qbo", "stripe"]).default("qbo"),
  description: z.string().max(500).nullable().optional(),
  lines: z.array(lineItemSchema).min(1).max(50),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  customerMemo: z.string().max(2000).nullable().optional(),
});

export type CreateInvoiceInput = z.input<typeof createSchema>;

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<ActionResult<{ invoiceId: string; hostedInvoiceUrl: string | null }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;

  if (data.provider === "qbo") {
    return createViaQbo(profile.userProfileId, data);
  }
  // Stripe path placeholder — for Bruce's reduced-Stripe usage it's
  // wired up to the existing Stripe wrapper but kept thin. The
  // existing Stripe webhook already mirrors paid status into invoices.
  return {
    ok: false,
    error:
      "Stripe provider path not yet wired in this UI — for now create the invoice directly in your Stripe dashboard. Phase 5+ will surface a unified Stripe form.",
  };
}

async function createViaQbo(
  coachUserProfileId: string,
  data: z.infer<typeof createSchema>,
): Promise<ActionResult<{ invoiceId: string; hostedInvoiceUrl: string | null }>> {
  const creds = await getValidQboCredentials(coachUserProfileId);
  if (!creds) {
    return {
      ok: false,
      error:
        "QuickBooks isn't connected yet. Open /business-builder/profile/quickbooks and click Connect.",
    };
  }

  // Resolve the engagement + a contact email/name to use as the
  // QBO customer.
  const ctx = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({
        id: engagements.id,
        orgId: engagements.orgId,
        name: engagements.name,
        qboCustomerId: engagements.qboCustomerId,
        qboRealmId: engagements.qboRealmId,
      })
      .from(engagements)
      .where(eq(engagements.id, data.engagementId))
      .limit(1);
    if (!eng) throw new Error("Engagement not found.");

    // Find the client lead user_profile for this engagement to use as
    // the customer email. Fall back to the prospect record if any.
    const [lead] = await tx
      .select({
        email: userProfiles.email,
        fullName: userProfiles.fullName,
      })
      .from(userProfiles)
      .where(eq(userProfiles.orgId, eng.orgId))
      .limit(1);

    const [maybeProspect] = await tx
      .select({
        email: prospects.contactEmail,
        name: prospects.contactName,
        company: prospects.companyName,
      })
      .from(prospects)
      .where(eq(prospects.convertedEngagementId, eng.id))
      .limit(1);

    return {
      eng,
      contactEmail:
        lead?.email ?? maybeProspect?.email ?? null,
      contactName:
        lead?.fullName ??
        maybeProspect?.name ??
        eng.name ??
        "Client",
      companyName:
        eng.name ?? maybeProspect?.company ?? "Client",
    };
  });

  // Resolve / create the QBO customer.
  let qboCustomerId = ctx.eng.qboCustomerId;
  if (
    !qboCustomerId ||
    (ctx.eng.qboRealmId && ctx.eng.qboRealmId !== creds.realmId)
  ) {
    let customer = ctx.contactEmail
      ? await findCustomerByEmail(
          creds.accessToken,
          creds.realmId,
          ctx.contactEmail,
        )
      : null;
    if (!customer) {
      customer = await createCustomer(creds.accessToken, creds.realmId, {
        displayName: ctx.companyName,
        email: ctx.contactEmail,
        companyName: ctx.companyName,
      });
    }
    qboCustomerId = customer.Id;
    await withSystemContext(async (tx) => {
      await tx
        .update(engagements)
        .set({
          qboCustomerId,
          qboRealmId: creds.realmId,
        })
        .where(eq(engagements.id, ctx.eng.id));
    });
  }

  // Create the QBO invoice.
  let qboInv;
  try {
    qboInv = await qboCreateInvoice(creds.accessToken, creds.realmId, {
      customerId: qboCustomerId!,
      lines: data.lines.map((l) => ({
        description: l.description,
        amount: l.amountCents / 100,
      })),
      dueDate: data.dueDate ?? undefined,
      customerMemo: data.customerMemo ?? undefined,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Mirror into our invoices table.
  const totalCents = Math.round(qboInv.TotalAmt * 100);
  const hostedUrl = qboInvoicePaymentLink(creds.realmId, qboInv.Id);
  const inserted = await withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(invoices)
      .values({
        orgId: ctx.eng.orgId,
        engagementId: ctx.eng.id,
        provider: "qbo",
        qboInvoiceId: qboInv.Id,
        qboRealmId: creds.realmId,
        number: qboInv.DocNumber ?? null,
        description: data.description ?? null,
        amountCents: totalCents,
        currency: "CAD",
        status: qboInv.Balance === 0 ? "paid" : "sent",
        issuedAt: qboInv.TxnDate ? new Date(qboInv.TxnDate) : new Date(),
        dueAt: qboInv.DueDate ? new Date(qboInv.DueDate) : null,
        paidAt: qboInv.Balance === 0 ? new Date() : null,
        hostedInvoiceUrl: hostedUrl,
      })
      .returning({ id: invoices.id });
    return row;
  });

  revalidatePath("/portal/invoices");
  revalidatePath(`/business-builder/documents/${ctx.eng.id}`);
  return {
    ok: true,
    data: { invoiceId: inserted.id, hostedInvoiceUrl: hostedUrl },
  };
}
