"use server";

/**
 * Prospect activity log — calls, emails, meetings, notes, stage changes.
 * Phase 5. Used to render the prospect detail timeline and to bump
 * the parent prospect's last_contact_at.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { prospectActivities, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { touchLastContact } from "./prospects";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ACTIVITY_TYPE_ENUM = z.enum([
  "call",
  "email",
  "meeting",
  "note",
  "stage_change",
  "web_lead",
  "signature_request",
]);

const logSchema = z.object({
  prospectId: z.string().uuid(),
  type: ACTIVITY_TYPE_ENUM,
  subject: z.string().trim().max(300).optional().transform((v) => v || null),
  body: z.string().trim().max(20_000).optional().transform((v) => v || null),
  occurredAt: z.string().datetime().optional(),
});

export async function logProspectActivity(
  input: z.input<typeof logSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = logSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;

  const inserted = await withSystemContext(async (tx) => {
    const [p] = await tx
      .select({ orgId: prospects.orgId })
      .from(prospects)
      .where(eq(prospects.id, data.prospectId))
      .limit(1);
    if (!p) throw new Error("Prospect not found.");
    const [row] = await tx
      .insert(prospectActivities)
      .values({
        prospectId: data.prospectId,
        orgId: p.orgId,
        type: data.type,
        subject: data.subject,
        body: data.body,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
        createdByUserProfileId: profile.userProfileId,
      })
      .returning({ id: prospectActivities.id });
    return row;
  });

  // Most activity types represent a touchpoint with the prospect.
  // Notes don't necessarily — leave them alone so a "private note"
  // doesn't push the prospect down the list.
  if (data.type !== "note" && data.type !== "stage_change") {
    await touchLastContact(data.prospectId);
  }

  revalidatePath(`/business-builder/pipeline/${data.prospectId}`);
  revalidatePath("/business-builder/pipeline");
  return { ok: true, data: { id: inserted.id } };
}

const editSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().max(300).nullable(),
  body: z.string().trim().max(20_000).nullable(),
});

/** Edit a logged activity's subject + body (fix a typo, add detail). */
export async function updateProspectActivity(
  input: z.input<typeof editSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = editSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { id, subject, body } = parsed.data;
  if (!subject && !body) {
    return { ok: false, error: "A note needs a subject or a body." };
  }

  const prospectId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ prospectId: prospectActivities.prospectId })
      .from(prospectActivities)
      .where(eq(prospectActivities.id, id))
      .limit(1);
    if (!row) return null;
    await tx
      .update(prospectActivities)
      .set({ subject: subject || null, body: body || null })
      .where(eq(prospectActivities.id, id));
    return row.prospectId;
  });
  if (!prospectId) return { ok: false, error: "Entry not found." };
  revalidatePath(`/business-builder/pipeline/${prospectId}`);
  return { ok: true, data: undefined };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteProspectActivity(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Invalid id." };

  const prospectId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ prospectId: prospectActivities.prospectId })
      .from(prospectActivities)
      .where(eq(prospectActivities.id, parsed.data.id))
      .limit(1);
    if (!row) return null;
    await tx
      .delete(prospectActivities)
      .where(eq(prospectActivities.id, parsed.data.id));
    return row.prospectId;
  });
  if (prospectId) {
    revalidatePath(`/business-builder/pipeline/${prospectId}`);
  }
  return { ok: true, data: undefined };
}
