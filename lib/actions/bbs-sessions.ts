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
 * Authorization: leadership roles only (master_admin / Coach /
 * client_lead / client_manager). Lower roles can VIEW but not
 * schedule.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { clientWriteBlocked, READ_ONLY_ERROR } from "@/lib/server/engagement-guard";
import {
  bbsSessions,
  engagements,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import {
  removeBbsSessionFromGoogle,
  syncBbsSessionToGoogle,
} from "@/lib/integrations/google-calendar";

const SESSION_DEFAULT_DURATION_MIN = 120; // 2 hours

function sessionDescription(args: {
  engagementName: string;
  type: string;
  notes: string | null;
}): string {
  const lines = [
    `Business Building Session · ${args.engagementName}`,
    `Format: ${args.type === "in_person" ? "In person" : "Virtual"}`,
  ];
  if (args.notes && args.notes.trim().length > 0) {
    lines.push("", args.notes.slice(0, 4000));
  }
  return lines.join("\n");
}

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
  revalidatePath(`/business-builder/sessions/${engagementId}`);
  if (sessionId) {
    revalidatePath(`/portal/sessions/${sessionId}`);
    revalidatePath(`/business-builder/sessions/${engagementId}/${sessionId}`);
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
  if (await clientWriteBlocked(profile.role, data.engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [eng] = await tx
          .select({ id: engagements.id, name: engagements.name })
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
        return { row, orgId: boundOrgId, engagementName: eng.name ?? "Engagement" };
      },
    );

    // Best-effort Google Calendar push — failure logged, doesn't block.
    void syncBbsSessionToGoogle({
      orgId: created.orgId,
      userProfileId: profile.userProfileId,
      bbsSessionId: created.row.id,
      summary: `${created.engagementName} - Business Building Session`,
      description: sessionDescription({
        engagementName: created.engagementName,
        type: data.type,
        notes: data.notes ?? null,
      }),
      startAt: scheduled,
      endAt: new Date(scheduled.getTime() + SESSION_DEFAULT_DURATION_MIN * 60_000),
      location: data.type === "in_person" ? "In person" : undefined,
    });

    revalidateSessionPaths(data.engagementId, created.row.id);
    return { ok: true, data: { id: created.row.id } };
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
    if (await clientWriteBlocked(profile.role, lookupEngId)) {
      return { ok: false, error: READ_ONLY_ERROR };
    }
    const result = await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx, boundOrgId) => {
        const [existing] = await tx
          .select({
            engagementId: bbsSessions.engagementId,
            scheduledAt: bbsSessions.scheduledAt,
            type: bbsSessions.type,
            notes: bbsSessions.notes,
            status: bbsSessions.status,
          })
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
        if (Object.keys(update).length === 0) {
          return {
            engagementId: existing.engagementId,
            orgId: boundOrgId,
            merged: {
              scheduledAt: existing.scheduledAt,
              type: existing.type,
              notes: existing.notes,
              status: existing.status,
            },
            changed: false,
          };
        }
        await tx
          .update(bbsSessions)
          .set(update)
          .where(eq(bbsSessions.id, id));

        const [eng] = await tx
          .select({ name: engagements.name })
          .from(engagements)
          .where(eq(engagements.id, existing.engagementId))
          .limit(1);

        return {
          engagementId: existing.engagementId,
          orgId: boundOrgId,
          engagementName: eng?.name ?? "Engagement",
          merged: {
            scheduledAt: update.scheduledAt ?? existing.scheduledAt,
            type: update.type ?? existing.type,
            notes: update.notes ?? existing.notes,
            status: existing.status,
          },
          changed: true,
        };
      },
    );
    const engagementId = result.engagementId;
    if (
      result.changed &&
      result.merged.status === "scheduled" &&
      result.merged.scheduledAt
    ) {
      void syncBbsSessionToGoogle({
        orgId: result.orgId,
        userProfileId: profile.userProfileId,
        bbsSessionId: id,
        summary: `${"engagementName" in result ? result.engagementName : "Engagement"} - Business Building Session`,
        description: sessionDescription({
          engagementName:
            "engagementName" in result ? (result.engagementName ?? "Engagement") : "Engagement",
          type: result.merged.type,
          notes: result.merged.notes,
        }),
        startAt: result.merged.scheduledAt,
        endAt: new Date(
          result.merged.scheduledAt.getTime() +
            SESSION_DEFAULT_DURATION_MIN * 60_000,
        ),
        location: result.merged.type === "in_person" ? "In person" : undefined,
      });
    }
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
    if (await clientWriteBlocked(profile.role, lookupEngId)) {
      return { ok: false, error: READ_ONLY_ERROR };
    }
    const result = await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx, boundOrgId) => {
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
        return { engagementId: existing.engagementId, orgId: boundOrgId };
      },
    );
    // Cancelled sessions get removed from Google. Re-opened ones get re-pushed.
    if (next === "cancelled") {
      void removeBbsSessionFromGoogle({
        orgId: result.orgId,
        userProfileId: profile.userProfileId,
        bbsSessionId: id,
      });
    }
    revalidateSessionPaths(result.engagementId, id);
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
    if (await clientWriteBlocked(profile.role, lookupEngId)) {
      return { ok: false, error: READ_ONLY_ERROR };
    }
    const result = await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx, boundOrgId) => {
        const [existing] = await tx
          .select({ engagementId: bbsSessions.engagementId })
          .from(bbsSessions)
          .where(eq(bbsSessions.id, id))
          .limit(1);
        if (!existing) throw new Error("Session not found.");
        await tx.delete(bbsSessions).where(eq(bbsSessions.id, id));
        return { engagementId: existing.engagementId, orgId: boundOrgId };
      },
    );
    void removeBbsSessionFromGoogle({
      orgId: result.orgId,
      userProfileId: profile.userProfileId,
      bbsSessionId: id,
    });
    revalidateSessionPaths(result.engagementId);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
