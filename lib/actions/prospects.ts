"use server";

/**
 * Prospect actions — coach lifecycle moves through the pipeline.
 * Phase 5 — full CRM.
 *
 * Surface:
 *   - createProspect (manual, by a Business Builder)
 *   - updateProspect (any field)
 *   - deleteProspect
 *   - touchLastContact (called from the activity logger so the
 *     "last contact" column stays accurate without manual updates)
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

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
  companyName: z.string().min(1).max(200),
  contactName: optionalString,
  contactEmail: z.string().email().max(254),
  phone: optionalString,
  companyWebsite: optionalString,
  leadSource: optionalString,
  expectedValueCents: z.number().int().nonnegative().nullable().optional(),
  nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  nextActionNote: optionalString,
  ownerUserProfileId: z.string().uuid().nullable().optional(),
  status: statusEnum.optional(),
  notes: z.string().max(40000).nullable().optional(),
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
        companyName: data.companyName,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail,
        phone: data.phone ?? null,
        companyWebsite: data.companyWebsite ?? null,
        leadSource: data.leadSource ?? null,
        expectedValueCents: data.expectedValueCents ?? null,
        nextActionDate: data.nextActionDate
          ? new Date(data.nextActionDate)
          : null,
        nextActionNote: data.nextActionNote ?? null,
        ownerUserProfileId: data.ownerUserProfileId ?? profile.userProfileId,
        status: data.status ?? "new_lead",
        notes: data.notes ?? null,
      })
      .returning({ id: prospects.id });
    return row;
  });

  revalidatePath("/coach/pipeline");
  return { ok: true, data: { id: inserted.id } };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string().min(1).max(200).optional(),
  contactName: optionalString,
  contactEmail: z.string().email().max(254).optional(),
  phone: optionalString,
  companyWebsite: optionalString,
  industry: optionalString,
  leadSource: optionalString,
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
      if (Object.keys(updates).length === 0) return;
      await tx.update(prospects).set(updates).where(eq(prospects.id, data.id));
    });
    revalidatePath("/coach/pipeline");
    revalidatePath(`/coach/pipeline/${data.id}`);
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
      await tx.delete(prospects).where(eq(prospects.id, id));
    });
    revalidatePath("/coach/pipeline");
    return { ok: true, data: undefined };
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
