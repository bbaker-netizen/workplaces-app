"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { hires, type UserProfile } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";

type Role = UserProfile["role"];
const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];
function canEdit(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const statusEnum = z.enum([
  "assessing",
  "interview_scheduled",
  "decision_pending",
  "offer_sent",
  "hired",
  "declined",
]);

const createSchema = z.object({
  engagementId: z.string().uuid(),
  candidateName: z.string().min(1).max(200),
  candidateEmail: z.string().email().nullable().optional(),
  roleName: z.string().min(1).max(200),
  status: statusEnum.default("assessing"),
  notes: z.string().max(50000).nullable().optional(),
});

const updateSchema = z.object({
  candidateName: z.string().min(1).max(200).optional(),
  candidateEmail: z.string().email().nullable().optional(),
  roleName: z.string().min(1).max(200).optional(),
  status: statusEnum.optional(),
  notes: z.string().max(50000).nullable().optional(),
  gapReportDocumentId: z.string().uuid().nullable().optional(),
  resumeDocumentId: z.string().uuid().nullable().optional(),
  offerDocumentId: z.string().uuid().nullable().optional(),
  interviewScheduledAt: z.string().datetime().nullable().optional(),
});

export type CreateHireInput = z.input<typeof createSchema>;
export type UpdateHireInput = z.input<typeof updateSchema>;

function revalidateHirePaths(id?: string) {
  revalidatePath("/portal/hiring");
  if (id) revalidatePath(`/portal/hiring/${id}`);
}

export async function createHire(
  input: CreateHireInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't add candidates." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(hires)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            candidateName: data.candidateName,
            candidateEmail: data.candidateEmail ?? null,
            roleName: data.roleName,
            status: data.status,
            notes: data.notes ?? null,
            createdByUserProfileId: profile.userProfileId,
          })
          .returning({ id: hires.id });
        return row;
      },
    );
    revalidateHirePaths();
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateHire(
  id: string,
  input: UpdateHireInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't edit candidates." };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord("hires", id);
  if (!engagementId)
    return { ok: false, error: "Candidate not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const update: Partial<typeof hires.$inferInsert> = {};
        if (data.candidateName !== undefined)
          update.candidateName = data.candidateName;
        if (data.candidateEmail !== undefined)
          update.candidateEmail = data.candidateEmail;
        if (data.roleName !== undefined) update.roleName = data.roleName;
        if (data.status !== undefined) {
          update.status = data.status;
          // Stamp transition timestamps as the status moves through
          // the funnel.
          if (data.status === "interview_scheduled") {
            update.interviewScheduledAt = new Date();
          } else if (
            data.status === "decision_pending" &&
            data.interviewScheduledAt === undefined
          ) {
            update.decisionAt = new Date();
          } else if (data.status === "offer_sent") {
            update.offerSentAt = new Date();
          } else if (data.status === "hired") {
            update.hiredAt = new Date();
          }
        }
        if (data.notes !== undefined) update.notes = data.notes;
        if (data.gapReportDocumentId !== undefined)
          update.gapReportDocumentId = data.gapReportDocumentId;
        if (data.resumeDocumentId !== undefined)
          update.resumeDocumentId = data.resumeDocumentId;
        if (data.offerDocumentId !== undefined)
          update.offerDocumentId = data.offerDocumentId;
        if (data.interviewScheduledAt !== undefined) {
          update.interviewScheduledAt = data.interviewScheduledAt
            ? new Date(data.interviewScheduledAt)
            : null;
        }
        if (Object.keys(update).length === 0) return;
        await tx.update(hires).set(update).where(eq(hires.id, id));
      },
    );
    revalidateHirePaths(id);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteHire(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't delete candidates." };
  const engagementId = await resolveEngagementIdFromRecord("hires", id);
  if (!engagementId)
    return { ok: false, error: "Candidate not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx.delete(hires).where(eq(hires.id, id));
      },
    );
    revalidateHirePaths();
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
