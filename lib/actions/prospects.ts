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

import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { validateProspect } from "@/lib/pipeline/validate-prospect";
import { formatPhone, normalizeWebsite } from "@/lib/format";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Keep in sync with prospectStatusEnum in schema.ts.
const statusEnum = z.enum([
  "new_lead",
  "diagnostic_pending",
  "contact_attempted",
  "first_contact",
  "meeting_scheduled",
  "appt_completed_followup",
  "diagnostic_complete",
  "proposal_sent",
  "negotiation",
  "contract_sent",
  "contract_signed",
  "onboarded",
  "lost",
  "not_qualified",
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
  linkedinUrl: optionalString,
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
        phone: data.phone ? formatPhone(data.phone) : null,
        companyWebsite: normalizeWebsite(data.companyWebsite),
        linkedinUrl: normalizeWebsite(data.linkedinUrl),
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
  linkedinUrl: optionalString,
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
  nextActionLocation: optionalString,
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
      const quality = validateProspect(
        {
          companyName: data.companyName,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          phone: data.phone ?? null,
          legalNameConfirmed: data.legalNameConfirmed ?? false,
        },
        "update",
      );
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
      if (data.phone !== undefined)
        updates.phone = data.phone ? formatPhone(data.phone) : null;
      if (data.companyWebsite !== undefined)
        updates.companyWebsite = normalizeWebsite(data.companyWebsite);
      if (data.linkedinUrl !== undefined)
        updates.linkedinUrl = normalizeWebsite(data.linkedinUrl);
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
      if (data.nextActionLocation !== undefined)
        updates.nextActionLocation = data.nextActionLocation;
      if (data.ownerUserProfileId !== undefined)
        updates.ownerUserProfileId = data.ownerUserProfileId;
      if (data.status !== undefined) {
        updates.status = data.status;
        // Stamp the signed date when they reach contract_signed.
        if (data.status === "contract_signed") {
          updates.contractSignedAt = new Date();
        }
      }
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

    // Keep the linked engagement (and its client org) in sync with the
    // prospect's company name so editing the contact flows through to the
    // Client Portal list / engagement header. BEST-EFFORT and OUTSIDE the
    // main write: a failure here must never roll back the prospect save
    // (that would silently drop the phone/website/LinkedIn the coach just
    // typed). Logged, not surfaced.
    if (data.companyName !== undefined) {
      try {
        await withSystemContext(async (tx) => {
          const [linked] = await tx
            .select({ engagementId: prospects.convertedEngagementId })
            .from(prospects)
            .where(eq(prospects.id, data.id))
            .limit(1);
          if (!linked?.engagementId) return;
          await tx
            .update(engagements)
            .set({ name: data.companyName })
            .where(eq(engagements.id, linked.engagementId));
          const [eng] = await tx
            .select({ orgId: engagements.orgId })
            .from(engagements)
            .where(eq(engagements.id, linked.engagementId))
            .limit(1);
          if (eng?.orgId) {
            await tx
              .update(orgs)
              .set({ name: data.companyName })
              .where(eq(orgs.id, eng.orgId));
          }
        });
      } catch (e) {
        console.error("[updateProspect] company-name propagation failed:", e);
      }
    }

    // Same idea for the program: keep the converted engagement's type in
    // step with the prospect's programType so the Pipeline and the
    // Engagements/Client-Portal list always agree. Best-effort.
    if (
      data.programType === "accelerator" ||
      data.programType === "implementer"
    ) {
      try {
        await withSystemContext(async (tx) => {
          const [linked] = await tx
            .select({ engagementId: prospects.convertedEngagementId })
            .from(prospects)
            .where(eq(prospects.id, data.id))
            .limit(1);
          if (!linked?.engagementId) return;
          await tx
            .update(engagements)
            .set({ type: data.programType as "accelerator" | "implementer" })
            .where(eq(engagements.id, linked.engagementId));
        });
      } catch (e) {
        console.error("[updateProspect] program propagation failed:", e);
      }
    }
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${data.id}`);
    revalidatePath("/business-builder/engagements");
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
      const [row] = await tx
        .update(prospects)
        .set({ archivedAt: new Date() })
        .where(eq(prospects.id, id))
        .returning({ engagementId: prospects.convertedEngagementId });
      // Portal follows the contact: archiving an active client archives
      // their engagement too — removed from the Engagements list and the
      // portal closed off.
      if (row?.engagementId) {
        await tx
          .update(engagements)
          .set({ status: "paused", archivedAt: new Date() })
          .where(eq(engagements.id, row.engagementId));
      }
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath("/business-builder/engagements");
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
      const [row] = await tx
        .update(prospects)
        .set({ archivedAt: null })
        .where(eq(prospects.id, id))
        .returning({ engagementId: prospects.convertedEngagementId });
      // Restoring a contact reactivates its engagement (and the portal).
      if (row?.engagementId) {
        await tx
          .update(engagements)
          .set({ status: "active", archivedAt: null })
          .where(eq(engagements.id, row.engagementId));
      }
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath(`/business-builder/pipeline/${id}`);
    revalidatePath("/business-builder/engagements");
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
        .returning({ engagementId: prospects.convertedEngagementId });
      // Pause any linked engagements so their portals follow suit.
      const engagementIds = result
        .map((r) => r.engagementId)
        .filter((id): id is string => Boolean(id));
      if (engagementIds.length > 0) {
        await tx
          .update(engagements)
          .set({ status: "paused", archivedAt: new Date() })
          .where(inArray(engagements.id, engagementIds));
      }
      return result.length;
    });
    revalidatePath("/business-builder/pipeline");
    revalidatePath("/business-builder/engagements");
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


/**
 * Permanently delete an archived LEAD (hard delete). Irreversible.
 *
 * Guarded three ways so it can only ever remove a true throwaway lead:
 *   1. The row must already be archived (archivedAt IS NOT NULL) — you
 *      archive first, then delete, so a mis-click is never one step.
 *   2. The row must NOT be a converted client (convertedEngagementId IS
 *      NULL). Clients keep their engagement, portal, documents and
 *      invoices, so they're archive-only and can't be destroyed here.
 *   3. Scoped to the caller's org.
 * The DB foreign keys cascade-delete prospect_activities and the alias
 * row, and null out any booking references, so no orphans are left.
 */
export async function permanentlyDeleteProspect(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  try {
    const result = await withSystemContext(async (tx) => {
      return await tx
        .delete(prospects)
        .where(
          and(
            eq(prospects.id, id),
            eq(prospects.orgId, profile.orgId),
            isNotNull(prospects.archivedAt),
            isNull(prospects.convertedEngagementId),
          ),
        )
        .returning({ id: prospects.id });
    });
    if (result.length === 0) {
      return {
        ok: false,
        error:
          "Can't permanently delete this record. Only archived leads can be " +
          "deleted — converted clients are archive-only.",
      };
    }
    revalidatePath("/business-builder/pipeline");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Bulk permanent-delete for the Archived view. Same guards as
 * permanentlyDeleteProspect, applied set-wide: only archived,
 * non-client rows in the caller's org are removed. Returns how many
 * were deleted and how many were skipped (clients / not archived) so
 * the UI can be honest about a partial result.
 */
export async function bulkPermanentlyDeleteProspects(
  ids: string[],
): Promise<ActionResult<{ deleted: number; skipped: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  if (!Array.isArray(ids) || ids.length === 0)
    return { ok: false, error: "Pick at least one record to delete." };
  if (ids.length > 200)
    return {
      ok: false,
      error: "Delete in smaller batches — 200 max at a time.",
    };
  for (const id of ids) {
    if (typeof id !== "string" || id.length > 100)
      return { ok: false, error: "Invalid prospect id in selection." };
  }
  try {
    const deleted = await withSystemContext(async (tx) => {
      const result = await tx
        .delete(prospects)
        .where(
          and(
            inArray(prospects.id, ids),
            eq(prospects.orgId, profile.orgId),
            isNotNull(prospects.archivedAt),
            isNull(prospects.convertedEngagementId),
          ),
        )
        .returning({ id: prospects.id });
      return result.length;
    });
    revalidatePath("/business-builder/pipeline");
    return { ok: true, data: { deleted, skipped: ids.length - deleted } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
