"use server";

/**
 * BBS Sessions — server actions (mutations).
 *
 * Phase 1.6 surface:
 *
 *   - `scheduleSession`  — create a future-dated session.
 *   - `updateSession`    — edit time / type / notes / fireflies recording id.
 *   - `completeSession`  — flip status to completed (notes can come either
 *                          before or after; the action just settles status).
 *   - `cancelSession`    — flip status to cancelled.
 *   - `deleteSession`    — hard delete. Action items linked via
 *                          `action_items.bbs_session_id` get null'd by FK.
 *
 * Authorization: leadership roles only (master_admin / coach /
 * client_lead / client_manager). Lower roles can VIEW but not
 * schedule.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  bbsSessions,
  engagements,
  type UserProfile,
} from "@/lib/db/schema";
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

function canSchedule(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

const sessionTypeEnum = z.enum(["in_person", "virtual"]);

/* ------------------------------- create ------------------------------- */

const scheduleSchema = z.object({
  engagementId: z.string().uuid(),
  // ISO datetime string (e.g. "2026-05-15T14:30") in the user's local
  // browser timezone. The server casts to a Date and persists in UTC.
  scheduledAt: z
    .string()
    .min(1, "Pick a date and time"),
  type: sessionTypeEnum,
  notes: z.string().max(50000).nullable().optional(),
});

export type ScheduleSessionInput = z.input<typeof scheduleSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function revalidateSessionPaths(engagementId: string, sessionId?: string) {
  revalidatePath("/portal/sessions");
  revalidatePath(`/coach/sessions/${engagementId}`);
  if (sessionId) {
    revalidatePath(`/portal/sessions/${sessionId}`);
    revalidatePath(`/coach/sessions/${engagementId}/${sessionId}`);
  }
}

export async function scheduleSession(
  input: ScheduleSessionInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canSchedule(profile.role)) {
    return { ok: false, error: "Your role can't schedule sessions." };
  }
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;
  const scheduled = new Date(data.scheduledAt);
  if (Number.isNaN(scheduled.getTime())) {
    return { ok: false, error: "Date and time isn't valid." };
  }

  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [eng] = await tx
          .select({ id: engagements.id })
          .from(engagements)
          .where(eq(engagements.id, data.engagementId))
          .limit(1);
        if (!eng) throw new Error("Engagement not found.");

        const [row] = await tx
          .insert(bbsSessions)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            scheduledAt: scheduled,
            type: data.type,
            notes: data.notes ?? null,
            createdByUserProfileId: profile.userProfileId,
          })
          .returning({ id: bbsSessions.id });
        return row;
      },
    );

    revalidateSessionPaths(data.engagementId, created.id);
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ------------------------------- update ------------------------------- */

const updateSchema = z.object({
  scheduledAt: z.string().min(1).optional(),
  type: sessionTypeEnum.optional(),
  notes: z.string().max(50000).nullable().optional(),
  firefliesRecordingId: z.string().max(200).nullable().optional(),
});

export type UpdateSessionInput = z.input<typeof updateSchema>;

export async function updateSession(
  id: string,
  input: UpdateSessionInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canSchedule(profile.role)) {
    return { ok: false, error: "Your role can't edit sessions." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  try {
    const lookupEngId = await resolveEngagementIdFromRecord(
      "bbs_sessions",
      id,
    );
    if (!lookupEngId) {
      return { ok: false, error: "Session not found." };
    }
    const engagementId = await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx) => {
        const [existing] = await tx
          .select({ engagementId: bbsSessions.engagementId })
          .from(bbsSessions)
          .where(eq(bbsSessions.id, id))
          .limit(1);
        if (!existing) throw new Error("Session not found.");

        const update: Partial<typeof bbsSessions.$inferInsert> = {};
        if (data.scheduledAt !== undefined) {
          const d = new Date(data.scheduledAt);
          if (Number.isNaN(d.getTime())) {
            throw new Error("Date and time isn't valid.");
          }
          update.scheduledAt = d;
        }
        if (data.type !== undefined) update.type = data.type;
        if (data.notes !== undefined) update.notes = data.notes;
        if (data.firefliesRecordingId !== undefined) {
          update.firefliesRecordingId = data.firefliesRecordingId;
        }
        if (Object.keys(update).length === 0) return existing.engagementId;
        await tx
          .update(bbsSessions)
          .set(update)
          .where(eq(bbsSessions.id, id));
        return existing.engagementId;
      },
    );
    revalidateSessionPaths(engagementId, id);
    // If a fireflies id was just attached, queue the background extract.
    if (
      data.firefliesRecordingId !== undefined &&
      data.firefliesRecordingId !== null &&
      data.firefliesRecordingId.trim().length > 0
    ) {
      const { emitInngestEvent } = await import("@/lib/inngest");
      await emitInngestEvent("bbs.fireflies.attached", { sessionId: id });
    }
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------- status transitions ----------------------- */

async function setStatus(
  id: string,
  next: "completed" | "cancelled" | "scheduled",
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canSchedule(profile.role)) {
    return { ok: false, error: "Your role can't update sessions." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }
  try {
    const lookupEngId = await resolveEngagementIdFromRecord(
      "bbs_sessions",
      id,
    );
    if (!lookupEngId) {
      return { ok: false, error: "Session not found." };
    }
    const engagementId = await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx) => {
        const [existing] = await tx
          .select({ engagementId: bbsSessions.engagementId })
          .from(bbsSessions)
          .where(eq(bbsSessions.id, id))
          .limit(1);
        if (!existing) throw new Error("Session not found.");
        await tx
          .update(bbsSessions)
          .set({ status: next })
          .where(eq(bbsSessions.id, id));
        return existing.engagementId;
      },
    );
    revalidateSessionPaths(engagementId, id);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const completeSession = (id: string) => setStatus(id, "completed");
export const cancelSession = (id: string) => setStatus(id, "cancelled");
export const reopenSession = (id: string) => setStatus(id, "scheduled");

/* ------------------------------- delete ------------------------------- */

export async function deleteSession(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canSchedule(profile.role)) {
    return { ok: false, error: "Your role can't delete sessions." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }
  try {
    const lookupEngId = await resolveEngagementIdFromRecord(
      "bbs_sessions",
      id,
    );
    if (!lookupEngId) {
      return { ok: false, error: "Session not found." };
    }
    const engagementId = await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx) => {
        const [existing] = await tx
          .select({ engagementId: bbsSessions.engagementId })
          .from(bbsSessions)
          .where(eq(bbsSessions.id, id))
          .limit(1);
        if (!existing) throw new Error("Session not found.");
        await tx.delete(bbsSessions).where(eq(bbsSessions.id, id));
        return existing.engagementId;
      },
    );
    revalidateSessionPaths(engagementId);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
