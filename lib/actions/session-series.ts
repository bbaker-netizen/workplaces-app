"use server";

/**
 * Session series — recurring meeting schedules.
 *
 *   - `createSessionSeries`    — define a cadence; materializes the
 *                                first horizon of instances immediately
 *                                so the UI has something to show.
 *   - `updateSessionSeries`    — retitle / renote / change duration.
 *   - `endSessionSeries`       — stop generating. Past instances stay;
 *                                future untouched ones are removed.
 *   - `materializeSeries`      — top up instances to the horizon.
 *                                Idempotent; also called by the nightly
 *                                rolling-horizon job.
 *
 * Authorization mirrors bbs-sessions: leadership roles write, everyone
 * in the engagement reads. The internal team workspace is reachable
 * only by internal roles, which `withEngagementContext` enforces via
 * the master-org binding.
 */

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { clientWriteBlocked, READ_ONLY_ERROR } from "@/lib/server/engagement-guard";
import {
  actionItems,
  agendaItems,
  bbsSessions,
  coaches,
  engagements,
  sessionSeries,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  type Tx,
} from "@/lib/db/tenant";
import {
  cadenceToRRule,
  DEFAULT_HORIZON_DAYS,
  occurrencesBetween,
  type Cadence,
} from "@/lib/scheduling/recurrence";
import {
  removeSeriesFromGoogle,
  syncSeriesToGoogle,
} from "@/lib/integrations/google-calendar";

type Role = UserProfile["role"];

const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];

function canManage(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const cadenceEnum = z.enum(["weekly", "biweekly", "monthly"]);
const sessionTypeEnum = z.enum(["in_person", "virtual"]);

function revalidateTeamPaths() {
  revalidatePath("/business-builder/team");
  revalidatePath("/portal/sessions");
}

/* ----------------------------- materialize ---------------------------- */

/**
 * Ensure instances exist for every slot between now and the horizon.
 *
 * Safe to call repeatedly: the partial unique index on
 * (series_id, series_occurrence_at) means a re-run inserts nothing.
 * That's deliberate — it lets the create path, the nightly job, and a
 * manual refresh all share one code path with no coordination.
 *
 * Runs inside the caller's transaction so a failure rolls back with it.
 */
async function materializeInTx(
  tx: Tx,
  boundOrgId: string,
  seriesId: string,
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): Promise<number> {
  const [series] = await tx
    .select()
    .from(sessionSeries)
    .where(eq(sessionSeries.id, seriesId))
    .limit(1);
  if (!series || !series.active) return 0;
  // App-source only. A google-source series has null cadence/anchor and
  // is materialized by syncGoogleSeries instead.
  if (series.source !== "app" || !series.anchorAt || !series.cadence) return 0;

  const now = new Date();
  const until = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const slots = occurrencesBetween({
    anchorAt: series.anchorAt,
    cadence: series.cadence as Cadence,
    from: now,
    until,
  });
  if (slots.length === 0) {
    await tx
      .update(sessionSeries)
      .set({ materializedUntil: until })
      .where(eq(sessionSeries.id, seriesId));
    return 0;
  }

  // `bbs_sessions.created_by_user_profile_id` is NOT NULL, but the
  // series' creator is SET NULL on profile deletion and the nightly job
  // has no user of its own. Fall back to the engagement's owning coach
  // so generation never breaks after someone leaves the practice.
  let creatorId = series.createdByUserProfileId;
  if (!creatorId) {
    const [owner] = await tx
      .select({ userProfileId: coaches.userProfileId })
      .from(engagements)
      .innerJoin(coaches, eq(coaches.id, engagements.coachId))
      .where(eq(engagements.id, series.engagementId))
      .limit(1);
    creatorId = owner?.userProfileId ?? null;
  }
  if (!creatorId) return 0;

  const inserted = await tx
    .insert(bbsSessions)
    .values(
      slots.map((slot) => ({
        orgId: boundOrgId,
        engagementId: series.engagementId,
        scheduledAt: slot,
        seriesOccurrenceAt: slot,
        seriesId: series.id,
        title: series.title,
        type: series.type,
        durationMin: series.durationMin,
        // Series-level notes are NOT copied down. They describe the
        // rhythm, not any one meeting, and the series row already holds
        // them. Copying them would also make every generated instance
        // look "not empty", which silently disables the disposable-
        // instance cleanup in endSessionSeries.
        createdByUserProfileId: creatorId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: bbsSessions.id });

  await tx
    .update(sessionSeries)
    .set({ materializedUntil: until })
    .where(eq(sessionSeries.id, seriesId));

  return inserted.length;
}

/** Public entry point — tops a single series up to the horizon. */
export async function materializeSeries(
  seriesId: string,
): Promise<ActionResult<{ created: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canManage(profile.role)) {
    return { ok: false, error: "Your role can't manage schedules." };
  }
  const engagementId = await resolveEngagementIdFromRecord(
    "session_series",
    seriesId,
  );
  if (!engagementId) return { ok: false, error: "Series not found." };

  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      (tx, boundOrgId) => materializeInTx(tx, boundOrgId, seriesId),
    );
    revalidateTeamPaths();
    return { ok: true, data: { created } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't refresh the schedule.",
    };
  }
}

/* ------------------------------- create ------------------------------- */

const createSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1, "Give the meeting a name").max(200),
  type: sessionTypeEnum,
  cadence: cadenceEnum,
  /** Datetime-local string already converted to a UTC ISO string by the
   *  client (see components/sessions/utils.ts fromDateTimeLocalValue). */
  anchorAt: z.string().min(1, "Pick the first date and time"),
  durationMin: z.number().int().min(5).max(600).default(60),
  notes: z.string().max(50000).nullable().optional(),
});

export type CreateSessionSeriesInput = z.input<typeof createSchema>;

export async function createSessionSeries(
  input: CreateSessionSeriesInput,
): Promise<ActionResult<{ id: string; created: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canManage(profile.role)) {
    return { ok: false, error: "Your role can't create a recurring meeting." };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  const data = parsed.data;

  const anchor = new Date(data.anchorAt);
  if (Number.isNaN(anchor.getTime())) {
    return { ok: false, error: "That date and time didn't parse." };
  }

  if (await clientWriteBlocked(profile.role, data.engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  try {
    const result = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(sessionSeries)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            title: data.title,
            type: data.type,
            cadence: data.cadence,
            anchorAt: anchor,
            durationMin: data.durationMin,
            notes: data.notes ?? null,
            createdByUserProfileId: profile.userProfileId,
          })
          .returning({ id: sessionSeries.id });

        const created = await materializeInTx(tx, boundOrgId, row.id);
        return { id: row.id, created, boundOrgId };
      },
    );

    // Push ONE recurring event to the creator's Google Calendar, after
    // the transaction so a calendar outage can't roll back the series.
    // Best-effort by design — syncSeriesToGoogle swallows its own errors.
    await syncSeriesToGoogle({
      orgId: result.boundOrgId,
      userProfileId: profile.userProfileId,
      sessionSeriesId: result.id,
      summary: data.title,
      description: data.notes ?? undefined,
      startAt: anchor,
      endAt: new Date(anchor.getTime() + data.durationMin * 60 * 1000),
      recurrence: cadenceToRRule(data.cadence),
    });

    revalidateTeamPaths();
    return { ok: true, data: { id: result.id, created: result.created } };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Couldn't create the recurring meeting.",
    };
  }
}

/* ------------------------------- update ------------------------------- */

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  durationMin: z.number().int().min(5).max(600).optional(),
  notes: z.string().max(50000).nullable().optional(),
});

export type UpdateSessionSeriesInput = z.input<typeof updateSchema>;

/**
 * Edit the series' descriptive fields.
 *
 * Cadence and anchor are deliberately NOT editable: changing them would
 * re-phase every future slot and orphan the agenda items already
 * attached to generated instances. Ending the series and starting a new
 * one is the honest operation, and it leaves the history intact.
 */
export async function updateSessionSeries(
  seriesId: string,
  input: UpdateSessionSeriesInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canManage(profile.role)) {
    return { ok: false, error: "Your role can't edit this schedule." };
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  const engagementId = await resolveEngagementIdFromRecord(
    "session_series",
    seriesId,
  );
  if (!engagementId) return { ok: false, error: "Series not found." };
  if (await clientWriteBlocked(profile.role, engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.durationMin !== undefined) {
    patch.durationMin = parsed.data.durationMin;
  }
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (Object.keys(patch).length === 0) return { ok: true, data: undefined };

  try {
    const updated = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .update(sessionSeries)
          .set(patch)
          .where(eq(sessionSeries.id, seriesId));

        // Retitling the series retitles future instances that nobody
        // has customized yet. Past and edited instances keep their own
        // title — renaming a rhythm shouldn't rewrite history.
        if (patch.title) {
          await tx
            .update(bbsSessions)
            .set({ title: patch.title as string })
            .where(
              and(
                eq(bbsSessions.seriesId, seriesId),
                eq(bbsSessions.status, "scheduled"),
                gt(bbsSessions.scheduledAt, new Date()),
              ),
            );
        }
        const [fresh] = await tx
          .select()
          .from(sessionSeries)
          .where(eq(sessionSeries.id, seriesId))
          .limit(1);
        return fresh ?? null;
      },
    );

    // Re-push to Google so a retitled or relengthened series doesn't
    // leave a stale recurring event on the calendar. App-source only —
    // a google-source series is read-only from the app's side (Google
    // owns it), and has no anchor to push.
    if (updated && updated.source === "app" && updated.anchorAt) {
      await syncSeriesToGoogle({
        orgId: updated.orgId,
        userProfileId: profile.userProfileId,
        sessionSeriesId: updated.id,
        summary: updated.title,
        description: updated.notes ?? undefined,
        startAt: updated.anchorAt,
        endAt: new Date(
          updated.anchorAt.getTime() + updated.durationMin * 60 * 1000,
        ),
        recurrence: cadenceToRRule(updated.cadence as Cadence),
      });
    }

    revalidateTeamPaths();
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save the changes.",
    };
  }
}

/* -------------------------------- end --------------------------------- */

/**
 * Stop a recurring meeting.
 *
 * Future instances that are still empty (no agenda items, no notes) are
 * deleted — they're noise nobody engaged with. Future instances that
 * DO carry content are kept and simply detached from the series, so
 * ending a rhythm never silently deletes someone's prepared agenda.
 * Past instances are always untouched.
 */
export async function endSessionSeries(
  seriesId: string,
): Promise<ActionResult<{ removed: number; kept: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canManage(profile.role)) {
    return { ok: false, error: "Your role can't end this schedule." };
  }
  const engagementId = await resolveEngagementIdFromRecord(
    "session_series",
    seriesId,
  );
  if (!engagementId) return { ok: false, error: "Series not found." };
  if (await clientWriteBlocked(profile.role, engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  try {
    const result = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        const future = await tx
          .select({
            id: bbsSessions.id,
            notes: bbsSessions.notes,
            agendaCount: sql<number>`(
              SELECT count(*)::int FROM agenda_items a
              WHERE a.bbs_session_id = ${bbsSessions.id}
            )`,
          })
          .from(bbsSessions)
          .where(
            and(
              eq(bbsSessions.seriesId, seriesId),
              eq(bbsSessions.status, "scheduled"),
              gt(bbsSessions.scheduledAt, new Date()),
            ),
          );

        const empty = future.filter(
          (s) => s.agendaCount === 0 && (s.notes ?? "").trim().length === 0,
        );
        const kept = future.length - empty.length;

        if (empty.length > 0) {
          await tx.delete(bbsSessions).where(
            inArray(
              bbsSessions.id,
              empty.map((s) => s.id),
            ),
          );
        }

        // Detach whatever FUTURE instance survived so it stops looking
        // recurring. Scoped to the same future/scheduled predicate as
        // the delete above — an unscoped update here would also strip
        // `series_occurrence_at` from completed historical meetings,
        // which breaks the materializer's idempotency key: re-creating
        // the same cadence later would regenerate slots those kept
        // instances already occupy, double-booking every date.
        if (future.length > 0) {
          await tx
            .update(bbsSessions)
            .set({ seriesId: null, seriesOccurrenceAt: null })
            .where(
              inArray(
                bbsSessions.id,
                future.map((s) => s.id),
              ),
            );
        }

        await tx
          .update(sessionSeries)
          .set({ active: false })
          .where(eq(sessionSeries.id, seriesId));

        return { removed: empty.length, kept, boundOrgId };
      },
    );

    // Pull the recurring event off the calendar too, so ending the
    // rhythm in The Builder doesn't leave a ghost meeting in Google.
    await removeSeriesFromGoogle({
      orgId: result.boundOrgId,
      userProfileId: profile.userProfileId,
      sessionSeriesId: seriesId,
    });

    revalidateTeamPaths();
    return { ok: true, data: { removed: result.removed, kept: result.kept } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't end the schedule.",
    };
  }
}

/* --------------------------- horizon top-up --------------------------- */

/**
 * Top up every active series across all engagements. Called by the
 * nightly Inngest job (lib/inngest/functions.ts) so a weekly touch-base
 * defined once keeps producing instances indefinitely.
 *
 * Uses system context to sweep across orgs, then binds per-engagement
 * for the writes — the same pattern the due-soon email cron uses.
 */
/* ==================================================================== */
/*  Google-owned series — the internal touch-base reads Google Calendar */
/* ==================================================================== */

/** How far ahead of now to pull Google occurrences into sessions. */
const GOOGLE_SYNC_HORIZON_DAYS = 90;
/** A little history so a session that just happened isn't dropped. */
const GOOGLE_SYNC_PAST_DAYS = 1;

/**
 * List the recurring Google events on the current internal user's
 * calendar, for the Team "link your touch-base" picker.
 */
export async function listLinkableGoogleSeries(): Promise<
  import("@/lib/integrations/google-calendar").RecurringSeriesOption[]
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  const { isInternalRole } = await import(
    "@/lib/db/queries/internal-workspace"
  );
  if (!isInternalRole(profile.role)) return [];
  const { listRecurringSeries } = await import(
    "@/lib/integrations/google-calendar"
  );
  return listRecurringSeries(profile.userProfileId);
}

const linkSchema = z.object({
  googleCalendarId: z.string().min(1),
  googleRecurringEventId: z.string().min(1),
  title: z.string().min(1).max(200),
});

export type LinkGoogleSeriesInput = z.input<typeof linkSchema>;

/**
 * Link a recurring Google event to the team workspace. Google owns the
 * schedule from here — we pull its occurrences into sessions and never
 * push back. Idempotent on (calendar, recurring event): re-linking the
 * same event reactivates the existing series rather than duplicating it.
 */
export async function linkGoogleSeries(
  input: LinkGoogleSeriesInput,
): Promise<ActionResult<{ id: string; synced: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  const { ensureInternalEngagementId, isInternalRole } = await import(
    "@/lib/db/queries/internal-workspace"
  );
  if (!isInternalRole(profile.role)) {
    return { ok: false, error: "Only Business Builders can link a team calendar." };
  }
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  const engagementId = await ensureInternalEngagementId();
  if (!engagementId) {
    return { ok: false, error: "Team workspace isn't set up yet." };
  }

  const { withSystemContext } = await import("@/lib/db/tenant");
  try {
    const seriesId = await withSystemContext(async (tx) => {
      const [existing] = await tx
        .select({ id: sessionSeries.id })
        .from(sessionSeries)
        .where(
          and(
            eq(sessionSeries.googleCalendarId, parsed.data.googleCalendarId),
            eq(
              sessionSeries.googleRecurringEventId,
              parsed.data.googleRecurringEventId,
            ),
          ),
        )
        .limit(1);

      if (existing) {
        // Re-link: reactivate, refresh title + which account we read.
        await tx
          .update(sessionSeries)
          .set({
            active: true,
            title: parsed.data.title,
            linkedByUserProfileId: profile.userProfileId,
          })
          .where(eq(sessionSeries.id, existing.id));
        return existing.id;
      }

      const [row] = await tx
        .insert(sessionSeries)
        .values({
          orgId: profile.orgId,
          engagementId,
          title: parsed.data.title,
          type: "virtual",
          source: "google",
          googleCalendarId: parsed.data.googleCalendarId,
          googleRecurringEventId: parsed.data.googleRecurringEventId,
          linkedByUserProfileId: profile.userProfileId,
          createdByUserProfileId: profile.userProfileId,
        })
        .returning({ id: sessionSeries.id });
      return row.id;
    });

    const synced = await syncGoogleSeries(seriesId);
    revalidateTeamPaths();
    return { ok: true, data: { id: seriesId, synced } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't link the calendar.",
    };
  }
}

/** Stop syncing a linked Google series. Empty future sessions are removed;
 *  ones carrying agendas/notes are kept and detached. */
export async function unlinkGoogleSeries(
  seriesId: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  const { isInternalRole } = await import(
    "@/lib/db/queries/internal-workspace"
  );
  if (!isInternalRole(profile.role)) {
    return { ok: false, error: "Only Business Builders can unlink a team calendar." };
  }
  const { withSystemContext } = await import("@/lib/db/tenant");
  try {
    await withSystemContext(async (tx) => {
      const future = await tx
        .select({
          id: bbsSessions.id,
          notes: bbsSessions.notes,
          agendaCount: sql<number>`(
            SELECT count(*)::int FROM agenda_items a
            WHERE a.bbs_session_id = ${bbsSessions.id}
          )`,
        })
        .from(bbsSessions)
        .where(
          and(
            eq(bbsSessions.seriesId, seriesId),
            eq(bbsSessions.status, "scheduled"),
            gt(bbsSessions.scheduledAt, new Date()),
          ),
        );

      const empty = future.filter(
        (s) => s.agendaCount === 0 && (s.notes ?? "").trim().length === 0,
      );
      if (empty.length > 0) {
        await tx.delete(bbsSessions).where(
          inArray(
            bbsSessions.id,
            empty.map((s) => s.id),
          ),
        );
      }
      if (future.length > 0) {
        await tx
          .update(bbsSessions)
          .set({ seriesId: null, googleInstanceId: null })
          .where(
            inArray(
              bbsSessions.id,
              future.map((s) => s.id),
            ),
          );
      }
      await tx
        .update(sessionSeries)
        .set({ active: false })
        .where(eq(sessionSeries.id, seriesId));
    });
    revalidateTeamPaths();
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't unlink the calendar.",
    };
  }
}

/**
 * Pull a linked Google series' occurrences into internal sessions.
 *
 * Idempotent via bbs_sessions.google_instance_id: each occurrence maps
 * to exactly one session. Handles three changes a coach can make in
 * Google:
 *   - a NEW occurrence appears        → insert a session
 *   - an occurrence MOVES (same id)   → update its time
 *   - an occurrence is CANCELLED, or the whole series is rescheduled so
 *     its instance ids change         → the now-absent future session is
 *                                       marked cancelled
 *
 * System context: also called by the cron, which has no signed-in user.
 * Returns the number of sessions created or updated.
 */
export async function syncGoogleSeries(seriesId: string): Promise<number> {
  const { withSystemContext } = await import("@/lib/db/tenant");
  const { listSeriesInstances } = await import(
    "@/lib/integrations/google-calendar"
  );

  const series = await withSystemContext(async (tx) => {
    const [s] = await tx
      .select()
      .from(sessionSeries)
      .where(eq(sessionSeries.id, seriesId))
      .limit(1);
    return s ?? null;
  });
  if (
    !series ||
    !series.active ||
    series.source !== "google" ||
    !series.googleCalendarId ||
    !series.googleRecurringEventId ||
    !series.linkedByUserProfileId
  ) {
    return 0;
  }

  // Resolve the creator for any new session rows (NOT NULL column).
  let creatorId: string | null = series.linkedByUserProfileId;
  if (!creatorId) {
    creatorId = await withSystemContext(async (tx) => {
      const [owner] = await tx
        .select({ userProfileId: coaches.userProfileId })
        .from(engagements)
        .innerJoin(coaches, eq(coaches.id, engagements.coachId))
        .where(eq(engagements.id, series.engagementId))
        .limit(1);
      return owner?.userProfileId ?? null;
    });
  }
  if (!creatorId) return 0;

  const now = new Date();
  const rangeStart = new Date(now.getTime() - GOOGLE_SYNC_PAST_DAYS * 864e5);
  const rangeEnd = new Date(now.getTime() + GOOGLE_SYNC_HORIZON_DAYS * 864e5);

  // Network fetch OUTSIDE the transaction so a slow Google call doesn't
  // hold a DB tx open.
  const instances = await listSeriesInstances(
    series.linkedByUserProfileId,
    series.googleCalendarId,
    series.googleRecurringEventId,
    rangeStart,
    rangeEnd,
  );

  return withSystemContext(async (tx) => {
    const existing = await tx
      .select({
        id: bbsSessions.id,
        googleInstanceId: bbsSessions.googleInstanceId,
        status: bbsSessions.status,
        scheduledAt: bbsSessions.scheduledAt,
      })
      .from(bbsSessions)
      .where(
        and(
          eq(bbsSessions.seriesId, seriesId),
          // only google-sourced rows carry an instance id
          sql`${bbsSessions.googleInstanceId} IS NOT NULL`,
        ),
      );
    const byInstance = new Map(
      existing.filter((e) => e.googleInstanceId).map((e) => [e.googleInstanceId as string, e]),
    );

    let touched = 0;
    const seen = new Set<string>();
    // New sessions created this run, for rehoming orphaned agendas on a
    // whole-series reschedule (see below).
    const newlyInserted: { id: string; start: Date }[] = [];

    for (const inst of instances) {
      seen.add(inst.instanceId);
      const durationMin = Math.max(
        5,
        Math.round((inst.end.getTime() - inst.start.getTime()) / 60000),
      );
      const type = inst.isVirtual ? "virtual" : "in_person";
      const prior = byInstance.get(inst.instanceId);

      if (inst.status === "cancelled") {
        // Occurrence cancelled in Google → cancel our session if present.
        if (prior && prior.status !== "cancelled") {
          await tx
            .update(bbsSessions)
            .set({ status: "cancelled" })
            .where(eq(bbsSessions.id, prior.id));
          touched += 1;
        }
        continue;
      }

      if (prior) {
        // Update in place only when something actually changed. Never
        // clobber a coach's manual "completed" — Google timing changes
        // shouldn't un-complete a meeting that already happened.
        const timeChanged =
          prior.scheduledAt.getTime() !== inst.start.getTime();
        if (timeChanged || prior.status === "cancelled") {
          await tx
            .update(bbsSessions)
            .set({
              scheduledAt: inst.start,
              durationMin,
              type,
              // A cancelled-then-restored occurrence comes back scheduled.
              status: prior.status === "cancelled" ? "scheduled" : prior.status,
            })
            .where(eq(bbsSessions.id, prior.id));
          touched += 1;
        }
        continue;
      }

      // New occurrence → create a session. onConflictDoNothing so a race
      // with a concurrent sync (the 30-min cron overlapping the initial
      // link sync) is a no-op rather than a unique-violation that aborts
      // the whole transaction.
      const [row] = await tx
        .insert(bbsSessions)
        .values({
          orgId: series.orgId,
          engagementId: series.engagementId,
          scheduledAt: inst.start,
          seriesId: series.id,
          googleInstanceId: inst.instanceId,
          title: series.title,
          type,
          durationMin,
          createdByUserProfileId: creatorId as string,
        })
        .onConflictDoNothing()
        .returning({ id: bbsSessions.id });
      if (row) {
        newlyInserted.push({ id: row.id, start: inst.start });
        touched += 1;
      }
    }

    // CRITICAL GUARD: if Google returned no occurrences at all, do NOT
    // cancel anything. An empty result almost always means the fetch
    // failed — the linking user disconnected Google (token row gone →
    // listSeriesInstances returns []) or a transient error — NOT that
    // the series genuinely ended. Without this guard, a disconnect would
    // silently cancel every future touch-base. A truly-ended series just
    // keeps stale future sessions until someone unlinks it, which is far
    // less harmful than wiping the schedule.
    if (instances.length === 0) {
      if (existing.some((e) => e.scheduledAt > now && e.status === "scheduled")) {
        console.warn(
          `[session-series] google sync for ${seriesId} got 0 occurrences with future sessions present — skipping cancel (likely disconnected calendar).`,
        );
      }
      return touched;
    }

    // Occurrences that vanished. On a WHOLE-series reschedule the instance
    // ids all change, so every future session's id disappears and new ones
    // are inserted — the old sessions would be cancelled out from under any
    // agenda items / tasked action items pointing at them. Rehome that
    // prepped work onto the new occurrences (ordinal-paired by time, which
    // is exact for a uniform time shift) before cancelling the stragglers.
    const vanished = existing
      .filter(
        (e) =>
          e.googleInstanceId &&
          !seen.has(e.googleInstanceId) &&
          e.status === "scheduled" &&
          e.scheduledAt > now,
      )
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    if (vanished.length > 0) {
      // Which vanished sessions carry agendas or tasked actions worth moving?
      const vanishedIds = vanished.map((v) => v.id);
      const withAgenda = new Set(
        (
          await tx
            .selectDistinct({ sid: agendaItems.bbsSessionId })
            .from(agendaItems)
            .where(inArray(agendaItems.bbsSessionId, vanishedIds))
        ).map((r) => r.sid),
      );
      const withActions = new Set(
        (
          await tx
            .selectDistinct({ sid: actionItems.bbsSessionId })
            .from(actionItems)
            .where(inArray(actionItems.bbsSessionId, vanishedIds))
        )
          .map((r) => r.sid)
          .filter((v): v is string => Boolean(v)),
      );

      const hasContent = vanished.filter(
        (v) => withAgenda.has(v.id) || withActions.has(v.id),
      );
      // Pair each content-bearing vanished session with the NEAREST new
      // occurrence by time (not ordinal — only some vanished sessions may
      // carry content, so ordinal indices wouldn't line up with weeks).
      // Each target is consumed once so two old meetings can't collapse
      // onto the same new one.
      const usedTargets = new Set<string>();
      for (const from of hasContent) {
        let best: { id: string; start: Date } | null = null;
        let bestGap = Infinity;
        for (const t of newlyInserted) {
          if (usedTargets.has(t.id)) continue;
          const gap = Math.abs(t.start.getTime() - from.scheduledAt.getTime());
          if (gap < bestGap) {
            bestGap = gap;
            best = t;
          }
        }
        if (!best) break; // no unused new occurrence to rehome onto
        usedTargets.add(best.id);
        await tx
          .update(agendaItems)
          .set({ bbsSessionId: best.id })
          .where(eq(agendaItems.bbsSessionId, from.id));
        await tx
          .update(actionItems)
          .set({ bbsSessionId: best.id })
          .where(eq(actionItems.bbsSessionId, from.id));
      }

      await tx
        .update(bbsSessions)
        .set({ status: "cancelled" })
        .where(inArray(bbsSessions.id, vanishedIds));
      touched += vanished.length;
    }

    await tx
      .update(sessionSeries)
      .set({ materializedUntil: rangeEnd })
      .where(eq(sessionSeries.id, seriesId));

    return touched;
  });
}

/**
 * Sweep every active google-linked series. Called from the 30-minute
 * calendar cron so a reschedule in Google shows up in the app within
 * half an hour, rather than waiting for the nightly top-up.
 */
export async function syncAllGoogleLinkedSeries(): Promise<{
  seriesProcessed: number;
  sessionsTouched: number;
}> {
  const { withSystemContext } = await import("@/lib/db/tenant");
  const rows = await withSystemContext(async (tx) =>
    tx
      .select({ id: sessionSeries.id })
      .from(sessionSeries)
      .where(
        and(
          eq(sessionSeries.active, true),
          eq(sessionSeries.source, "google"),
        ),
      ),
  );
  let sessionsTouched = 0;
  for (const row of rows) {
    try {
      sessionsTouched += await syncGoogleSeries(row.id);
    } catch (err) {
      console.error(`[session-series] google sync failed for ${row.id}`, err);
    }
  }
  return { seriesProcessed: rows.length, sessionsTouched };
}

export async function topUpAllSeries(): Promise<{
  seriesProcessed: number;
  instancesCreated: number;
}> {
  const { withSystemContext } = await import("@/lib/db/tenant");

  const rows = await withSystemContext(async (tx) =>
    tx
      .select({
        id: sessionSeries.id,
        engagementId: sessionSeries.engagementId,
        orgId: sessionSeries.orgId,
        source: sessionSeries.source,
      })
      .from(sessionSeries)
      .where(eq(sessionSeries.active, true)),
  );

  let instancesCreated = 0;
  for (const row of rows) {
    try {
      if (row.source === "google") {
        // Google owns the schedule — pull its occurrences in.
        instancesCreated += await syncGoogleSeries(row.id);
      } else {
        // System context, NOT withEngagementContext. There is no signed-in
        // user behind a cron run, so the per-Business-Builder access check
        // inside withEngagementContext (which calls ensureUserProfile)
        // would deny every engagement and the sweep would silently create
        // nothing. Same reason the due-soon email cron uses system context.
        // The org id comes from the series row itself, so inserts are still
        // written into the right tenant.
        instancesCreated += await withSystemContext((tx) =>
          materializeInTx(tx, row.orgId, row.id),
        );
      }
    } catch (err) {
      // One bad series must not stop the sweep.
      console.error(`[session-series] top-up failed for ${row.id}`, err);
    }
  }

  return { seriesProcessed: rows.length, instancesCreated };
}
