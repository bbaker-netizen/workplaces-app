"use server";

/**
 * QuickBooks billing setup + the recurring retainer invoice.
 *
 * A QBO invoice line requires an ItemRef, and the id is specific to Bruce's
 * QuickBooks file — so the service item and tax code are chosen once in
 * Settings and reused for every client. That also keeps every retainer
 * landing in the same revenue account.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import {
  createMonthlyRecurringInvoice,
  getValidQboCredentials,
  listServiceItems,
  listTaxCodes,
  type QboItem,
  type QboTaxCode,
} from "@/lib/integrations/qbo";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Items + tax codes to choose from, read live from QuickBooks. */
export async function listQboBillingOptions(): Promise<
  ActionResult<{ items: QboItem[]; taxCodes: QboTaxCode[] }>
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin")
    return { ok: false, error: "Only the practice owner can set this." };
  const creds = await getValidQboCredentials(profile.userProfileId);
  if (!creds)
    return {
      ok: false,
      error:
        "QuickBooks isn't connected. Connect it under Settings → QuickBooks first.",
    };
  try {
    const [items, taxCodes] = await Promise.all([
      listServiceItems(creds.accessToken, creds.realmId),
      listTaxCodes(creds.accessToken, creds.realmId),
    ]);
    return { ok: true, data: { items, taxCodes } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const saveSchema = z.object({
  itemId: z.string().max(50).nullable(),
  itemName: z.string().max(200).nullable(),
  taxCodeId: z.string().max(50).nullable(),
  taxCodeName: z.string().max(200).nullable(),
});

const cardUrlSchema = z.object({
  url: z.string().trim().max(500),
});

/**
 * The practice's hosted payment page for card authorizations.
 *
 * A LINK, not a form. Card numbers are never collected by this
 * application — they go straight to QuickBooks Payments or Stripe, which
 * keeps card data (and PCI obligations) out of a coaching practice's
 * database entirely.
 */
export async function saveCardPaymentUrl(
  input: z.input<typeof cardUrlSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin")
    return { ok: false, error: "Only the practice owner can set this." };
  const parsed = cardUrlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const url = parsed.data.url;
  // Blank clears it. Anything else must be a real https link — a client
  // handed a malformed payment URL simply cannot pay.
  if (url && !/^https:\/\/\S+$/.test(url))
    return { ok: false, error: "Enter a full https:// link, or leave blank." };
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(orgs)
        .set({ cardPaymentUrl: url || null })
        .where(eq(orgs.id, profile.orgId));
    });
    revalidatePath("/business-builder/settings/quickbooks-billing");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveQboBillingDefaults(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin")
    return { ok: false, error: "Only the practice owner can set this." };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(orgs)
        .set({
          qboServiceItemId: parsed.data.itemId,
          qboServiceItemName: parsed.data.itemName,
          qboTaxCodeId: parsed.data.taxCodeId,
          qboTaxCodeName: parsed.data.taxCodeName,
        })
        .where(eq(orgs.id, profile.orgId));
    });
    revalidatePath("/business-builder/settings/quickbooks-billing");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Set up the client's monthly retainer as a recurring invoice in QuickBooks.
 *
 * Created INACTIVE and unsent — it sits in QuickBooks' recurring list until a
 * human activates it. That is the deliberate safety line Bruce chose: a bug
 * here must not be able to invoice a client, or double-invoice them, before
 * anyone has looked at it.
 */
export async function createRetainerRecurringInvoice(
  engagementId: string,
): Promise<ActionResult<{ recurringInvoiceId: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  if (!z.string().uuid().safeParse(engagementId).success)
    return { ok: false, error: "Invalid id." };
  if (!(await canCurrentBbAccessEngagement(engagementId)))
    return { ok: false, error: "You don't have access to that client." };

  const ctx = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({
        name: engagements.name,
        monthlyFeeCents: engagements.monthlyFeeCents,
      })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    const [org] = await tx
      .select({
        itemId: orgs.qboServiceItemId,
        itemName: orgs.qboServiceItemName,
        taxCodeId: orgs.qboTaxCodeId,
      })
      .from(orgs)
      .where(eq(orgs.id, profile.orgId))
      .limit(1);
    // The QBO customer is linked on the originating lead.
    const [p] = await tx
      .select({ qboCustomerId: prospects.qboCustomerId })
      .from(prospects)
      .where(eq(prospects.convertedEngagementId, engagementId))
      .limit(1);
    return { eng: eng ?? null, org: org ?? null, prospect: p ?? null };
  });

  if (!ctx.eng) return { ok: false, error: "Client not found." };
  if (!ctx.org?.itemId) {
    return {
      ok: false,
      error:
        "Pick the QuickBooks service item first, under Settings → QuickBooks billing.",
    };
  }
  if (!ctx.prospect?.qboCustomerId) {
    return {
      ok: false,
      error:
        "This client isn't linked to a QuickBooks customer yet — link it on their lead, then try again.",
    };
  }
  if (!ctx.eng.monthlyFeeCents || ctx.eng.monthlyFeeCents <= 0) {
    return {
      ok: false,
      error:
        "This client has no monthly fee set, so there's nothing to bill. Set it on the client first.",
    };
  }

  const creds = await getValidQboCredentials(profile.userProfileId);
  if (!creds)
    return { ok: false, error: "QuickBooks isn't connected." };

  try {
    const { id } = await createMonthlyRecurringInvoice(
      creds.accessToken,
      creds.realmId,
      {
        customerId: ctx.prospect.qboCustomerId,
        amount: ctx.eng.monthlyFeeCents / 100,
        itemId: ctx.org.itemId,
        taxCodeId: ctx.org.taxCodeId,
        description: ctx.org.itemName ?? "Business Building retainer",
        templateName: `${ctx.eng.name ?? "Client"} — monthly retainer`,
      },
    );
    revalidatePath(`/business-builder/engagements/${engagementId}`);
    return { ok: true, data: { recurringInvoiceId: id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
