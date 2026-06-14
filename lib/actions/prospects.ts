"use server";

/**
 * Prospect actions — Coach lifecycle moves through the pipeline.
 * Phase 5 — full CRM.
 *
 * Surface:
 *   - createProspect (manual, by a Coach)
 *   - updateProspect (any field)
 *   - deleteProspect
 *   - touchLastContact (called from the activity logger so the
 *     "last contact" column stays accurate without manual updates)
 */

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { validateProspect } from "@/lib/pipeline/validate-prospect";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const statusEnum = z.enum([
  "new_lead",
  "diagnostic_pending",
  "first_contact",
  "meeting_scheduled",
  "diagnostic_complete",
  "proposal_sent",
  "negotiation",
  "contract_sent",
  "contract_signed",
  "onboarded",
  "lost",
]);

const optionalString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .nullable();

const createSchema = z.object({
  companyName: z.string().min(2).max(200),
  // Contact name is now required (was optional). Quality rule:
  // every prospect needs a real human contact so follow-up isn't
  // pointing at thin air.
  contactName: z.string().min(2).max(200),
  contactEmail: z.string().email().max(254),
  phone: optionalString,
  companyWebsite: optionalString,
  leadSource: optionalString,
  referrerName: optionalString,
  expectedValueCents: z.number().int().nonnegative().nullable().optional(),
  nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  nextActionNote: optionalString,
  ownerUserProfileId: z.string().uuid().nullable().optional(),
  status: statusEnum.optional(),
  notes: z.string().max(40000).nullable().optional(),
  /** Client ticked "Yes, this is the legal name" to bypass the
   *  "company name looks like a person" soft warning. */
  legalNameConfirmed: z.boolean().optional(),
  /** Program type for the engagement-to-be. Captured on the prospect
   *  so the BBA can read it before a formal engagement exists. */
  programType: z
    .enum(["accelerator", "implementer"])
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  pricingTier: optionalString,
  monthlyFeeCents: z.number().int().nonnegative().nullable().optional(),
  expectedStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export async function createProspect(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
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

  // Apply the shared data-quality rules. Server enforces hard
  // errors even if the client somehow bypassed them.
  const quality = validateProspect({
    companyName: data.companyName,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    phone: data.phone ?? null,
    legalNameConfirmed: data.legalNameConfirmed ?? false,
    leadSource: data.leadSource ?? null,
    referrerName: data.referrerName ?? null,
  });
  if (!quality.ok) {
    return {
      ok: false,
      error: quality.errors[0]?.message ?? "Validation failed.",
    };
  }

  const inserted = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) throw new Error("Master org not configured.");
    const [row] = await tx
      .insert(prospects)
      .values({
        orgId: master.id,
        companyName: data.companyName.trim(),
        contactName: data.contactName.trim(),
        contactEmail: data.contactEmail,
        phone: data.phone ?? null,
        companyWebsite: data.companyWebsite ?? null,
        leadSource: data.leadSource ?? null,
        referrerName: data.referrerName ?? null,
        expectedValueCents: data.expectedValueCents ?? null,
        nextActionDate: data.nextActionDate
          ? new Date(data.nextActionDate)
          : null,
        nextActionNote: data.nextActionNote ?? null,
        ownerUserProfileId: data.ownerUserProfileId ?? profile.userProfileId,
        status: data.status ?? "new_lead",
        notes: data.notes ?? null,
        programType: data.programType ?? null,
        pricingTier: data.pricingTier ?? null,
        monthlyFeeCents: data.monthlyFeeCents ?? null,
        expectedStartDate: data.expectedStartDate
          ? new Date(data.expectedStartDate)
          : null,
      })
      .returning({ id: prospects.id });
    return row;
  });

  revalidatePath("/business-builder/pipeline");
  return { ok: true, data: { id: inserted.id } };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string().min(2).max(200).optional(),
  contactName: z.string().min(2).max(200).optional(),
  contactEmail: z.string().email().max(254).optional(),
  phone: optionalString,
  companyWebsite: optionalString,
  industry: optionalString,
  leadSource: optionalString,
  referrerName: optionalString,
  expectedValueCents: z.number().int().nonnegative().nullable().optional(),
  nextActionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  nextActionNote: optionalString,
  ownerUserProfileId: z.string().uuid().nullable().optional(),
  status: statusEnum.optional(),
  notes: z.string().max(40000).nullable().optional(),
  /** Bypass the "company name looks like a person" soft warning. */
  legalNameConfirmed: z.boolean().optional(),
  programType: z
    .enum(["accelerator", "implementer"])
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  pricingTier: optionalString,
  monthlyFeeCents: z.number().int().nonnegative().nullable().optional(),
  expectedStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export async function updateProspect(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;

  // Apply data-quality rules to any identity fields the caller is
  // actually updating. We only validate fields that are being changed
  // — partial updates that don't touch the name fields skip these
  // checks. To validate completely we'd need to load the existing row
  // first; the create-time validation already enforces the same rules,
  // so this is a meaningful guard against bad edits without slowing
  // partial-update calls (status changes, next-action-date changes,
  // etc.) with an extra DB read.
  if (
    data.companyName !== undefined ||
    data.contactName !== undefined ||
    data.contactEmail !== undefined ||
    data.phone !== undefined
  ) {
    // Only run the full validator when we have all three identity
    // fields to compare. Otherwise pass-through.
    if (
      data.companyName !== undefined &&
      data.contactName !== undefined &&
      data.contactEmail !== undefined
    ) {
      const quality = validateProspect({
        companyName: data.companyName,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        phone: data.phone ?? null,
        legalNameConfirmed: data.legalNameConfirmed ?? false,
      });
      if (!quality.ok) {
        return {
          ok: false,
          error: quality.errors[0]?.message ?? "Validation failed.",
        };
      }
    }
  }
  // Referral leads must carry a referrer. Enforce whenever the lead
  // source is being set to Referral (the deal card sends both together).
  if (
    data.leadSource !== undefined &&
    (data.leadSource ?? "").trim().toLowerCase() === "referral" &&
    (data.referrerName ?? "").trim().length < 2
  ) {
    return {
      ok: false,
      error: "Add the referrer's name — Referral leads need a referrer on file.",
    };
  }
  try {
    await withSystemContext(async (tx) => {
      const updates: Partial<typeof prospects.$inferInsert> = {};
      if (data.companyName !== undefined) updates.companyName = data.companyName;
      if (data.contactName !== undefined) updates.contactName = data.contactName;
      if (data.contactEmail !== undefined) updates.contactEmail = data.contactEmail;
      if (data.phone !== undefined) updates.phone = data.phone;
      if (data.companyWebsite !== undefined) updates.companyWebsite = data.companyWebsite;
      if (data.industry !== undefined) updates.industry = data.industry;
      if (data.leadSource !== undefined) updates.leadSource = data.leadSource;
      if (data.referrerName !== undefined)
        updates.referrerName = data.referrerName;
      if (data.expectedValueCents !== undefined)
        updates.expectedValueCents = data.expectedValueCents;
      if (data.nextActionDate !== undefined)
        updates.nextActionDate = data.nextActionDate
          ? new Date(data.nextActionDate)
          : null;
      if (data.nextActionNote !== undefined)
        updates.nextActionNote = data.nextActionNote;
      if (data.ownerUserProfileId !== undefined)
        updates.ownerUserProfileId = data.ownerUserProfileId;
      if (data.status !== undefined) updates.status = data.status;
      if (data.notes !== undefined) updates.notes = data.notes;
      if (data.programType !== undefined)
        updates.programType = data.programType;
      if (data.pricingTier !== undefined)
        updates.pricingTier = data.pricingTier;
      if (data.monthlyFeeCents !== undefined)
        updates.monthlyFeeCents = data.monthlyFeeCents;
      if (data.expectedStartDate !== undefined)
        updates.expectedStartDate = data.expectedStartDate
          ? new Date(data.expectedStartDate)
          : null;
      if (Object.keys(updates).length === 0) return;
      await tx.update(prospects).set(updates).where(eq(prospects.id, data.id));
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${data.id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteProspect(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  try {
    await withSystemContext(async (tx) => {
      // Soft-delete: archive instead of hard-delete so a mis-click is
      // recoverable. The activity log + communications stay intact.
      await tx
        .update(prospects)
        .set({ archivedAt: new Date() })
        .where(eq(prospects.id, id));
    });
    revalidatePath("/business-builder/pipeline");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Restore an archived prospect back into the active pipeline. */
export async function unarchiveProspect(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(prospects)
        .set({ archivedAt: null })
        .where(eq(prospects.id, id));
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Delete a set of prospects in one transaction. Used by the bulk-
 * select toolbar on the pipeline list. Returns the count actually
 * deleted so the UI can show a confirmation toast like "3 prospects
 * deleted".
 *
 * Skips any rows that don't belong to the caller's org (the WHERE
 * clause filters by orgId), so a malicious payload of foreign IDs
 * can't bleed across tenants.
 */
export async function bulkDeleteProspects(
  ids: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  if (!Array.isArray(ids) || ids.length === 0)
    return { ok: false, error: "Pick at least one prospect to delete." };
  if (ids.length > 200)
    return {
      ok: false,
      error: "Delete in smaller batches — 200 max at a time.",
    };
  // Basic shape check; UUIDs are 36 chars.
  for (const id of ids) {
    if (typeof id !== "string" || id.length > 100) {
      return { ok: false, error: "Invalid prospect id in selection." };
    }
  }
  try {
    const deleted = await withSystemContext(async (tx) => {
      // Soft-delete in bulk — archive, don't destroy.
      const result = await tx
        .update(prospects)
        .set({ archivedAt: new Date() })
        .where(
          and(inArray(prospects.id, ids), eq(prospects.orgId, profile.orgId)),
        )
        .returning({ id: prospects.id });
      return result.length;
    });
    revalidatePath("/business-builder/pipeline");
    return { ok: true, data: { deleted } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Update the `last_contact_at` timestamp. Called whenever an
 * activity is logged so the Pipeline list's "Last contact" column
 * stays current without manual edits.
 */
export async function touchLastContact(prospectId: string): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx
      .update(prospects)
      .set({ lastContactAt: new Date() })
      .where(eq(prospects.id, prospectId));
  });
}
