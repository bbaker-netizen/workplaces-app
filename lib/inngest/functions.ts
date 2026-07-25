/**
 * Inngest functions registered against `inngest`. Each one is a
 * background job; the /api/inngest mount serves them to Inngest cloud.
 *
 * Phase 4 + 4.5. Functions:
 *   - dueSoonFlush      — Mon–Fri 09:00 MT email reminder for action
 *                         items due in the next 30h.
 *   - firefliesExtract  — Triggered by `bbs.fireflies.attached` event.
 *                         Pulls the transcript + drafts action items.
 *
 * Removed Phase 4.5:
 *   - embeddingRefresh  — Soul File search no longer uses embeddings;
 *                         retrieval goes through Claude directly.
 *   - adobeOauthRefresh — Native e-signing replaced Adobe Sign.
 */

import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import {
  actionItems,
  bbsSessions,
  notifications,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { actionItemDueSoonEmail } from "@/lib/email/templates";

/* -------------------------- due-soon flush -------------------------- */

export const dueSoonFlush = inngest.createFunction(
  { id: "due-soon-flush" },
  // 16:00 UTC Mon–Fri = 09:00 MST / 10:00 MDT.
  { cron: "0 16 * * 1-5" },
  async ({ step }) => {
    const sent = await step.run("flush", async () => {
      const horizon = new Date(Date.now() + 30 * 60 * 60 * 1000);
      const now = new Date();
      return withSystemContext(async (tx) => {
        const due = await tx
          .select({
            id: actionItems.id,
            title: actionItems.title,
            orgId: actionItems.orgId,
            engagementId: actionItems.engagementId,
            dueDate: actionItems.dueDate,
            status: actionItems.status,
            assigneeUserProfileId: actionItems.assigneeUserProfileId,
          })
          .from(actionItems)
          .where(
            and(
              isNotNull(actionItems.assigneeUserProfileId),
              isNotNull(actionItems.dueDate),
              gt(actionItems.dueDate, now),
              lt(actionItems.dueDate, horizon),
            ),
          );

        let count = 0;
        for (const item of due) {
          if (item.status === "done" || item.status === "draft") continue;
          if (!item.assigneeUserProfileId || !item.dueDate) continue;
          const [already] = await tx
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                eq(notifications.parentEntityId, item.id),
                eq(notifications.type, "action_item_due_soon"),
              ),
            )
            .limit(1);
          if (already) continue;

          const [assignee] = await tx
            .select({
              email: userProfiles.email,
              fullName: userProfiles.fullName,
            })
            .from(userProfiles)
            .where(eq(userProfiles.id, item.assigneeUserProfileId))
            .limit(1);
          if (!assignee?.email) continue;

          await tx.insert(notifications).values({
            orgId: item.orgId,
            userProfileId: item.assigneeUserProfileId,
            type: "action_item_due_soon",
            parentEntityType: "action_item",
            parentEntityId: item.id,
            sentVia: "email",
          });
          await sendEmailQuietly(
            actionItemDueSoonEmail({
              to: assignee.email,
              recipientName: assignee.fullName,
              itemTitle: item.title,
              dueDate: item.dueDate,
              url: `/portal/action-items/${item.id}`,
            }),
          );
          count++;
        }
        return count;
      });
    });
    return { sent };
  },
);

/* ------------------------- Fireflies extract ------------------------- */

export const firefliesExtract = inngest.createFunction(
  {
    id: "fireflies-extract",
    retries: 2,
  },
  { event: "bbs.fireflies.attached" },
  async ({ event, step }) => {
    const sessionId = event.data?.sessionId as string | undefined;
    if (!sessionId) return { ok: false, reason: "no-session-id" };

    return step.run("extract", async () => {
      // We fetch the session id and let the existing server action do
      // the work. The action requires an authenticated profile, so we
      // run a system-context shim that reads the Coach who created
      // the session and performs the extraction directly.
      const session = await withSystemContext(async (tx) => {
        const [row] = await tx
          .select()
          .from(bbsSessions)
          .where(eq(bbsSessions.id, sessionId))
          .limit(1);
        return row ?? null;
      });
      if (!session) return { ok: false, reason: "session-missing" };
      if (!session.firefliesRecordingId)
        return { ok: false, reason: "no-recording-id" };

      // Defer to the action's logic. Imported lazily to avoid a
      // circular dependency at module load.
      const { extractFromFirefliesAsSystem } = await import(
        "@/lib/actions/fireflies-extract"
      );
      const result = await extractFromFirefliesAsSystem(sessionId);
      return result;
    });
  },
);

/* ------------------------- calendar sync ------------------------- */

export const calendarSync = inngest.createFunction(
  { id: "calendar-sync" },
  // Every 30 minutes — pulls each connected coach's upcoming Google
  // Calendar events into BBS sessions for the matching engagement.
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    const clients = await step.run("sync-clients", async () => {
      const { syncAllConnectedCalendars } = await import("@/lib/calendar/sync");
      return syncAllConnectedCalendars();
    });
    // Pull internal team touch-bases from their linked Google events in
    // the same cadence, so a reschedule shows up within ~30 min.
    const internal = await step.run("sync-internal-series", async () => {
      const { syncAllGoogleLinkedSeries } = await import(
        "@/lib/actions/session-series"
      );
      return syncAllGoogleLinkedSeries();
    });
    return { clients, internal };
  },
);

/* ------------------------- Fireflies sync ------------------------- */

export const firefliesSync = inngest.createFunction(
  { id: "fireflies-sync" },
  // Hourly — pulls every active engagement's Fireflies meeting notes
  // (recaps + recording links) into engagement_meetings so each client's
  // "Meeting notes" module stays current, including recurring BBS calls.
  { cron: "0 * * * *" },
  async ({ step }) => {
    const sync = await step.run("sync", async () => {
      const { syncAllEngagementMeetings } = await import(
        "@/lib/actions/sync-engagement-meetings"
      );
      return syncAllEngagementMeetings();
    });

    // EA: draft a recap for any session whose transcript has landed and
    // that has not been recapped yet. Riding this cron rather than
    // adding another is what makes "within an hour of the transcript
    // landing" true. A separate step so a recap failure never rolls back
    // the meeting sync above.
    const recaps = await step.run("ea-recap-sweep", async () => {
      const { runRecapSweep } = await import("@/lib/ea/recap-sweep");
      const { withHeartbeat, gradeSweep } = await import("@/lib/ea/job-runs");
      return withHeartbeat(
        "ea-recap-sweep",
        () => runRecapSweep(),
        (r) => r.drafted,
        (r) => gradeSweep({ succeeded: r.drafted + r.skipped, failed: r.failed }),
      );
    });

    return { sync, recaps };
  },
);

/* ------------------------ EA: morning digest ------------------------ */

export const eaDailyDigest = inngest.createFunction(
  { id: "ea-daily-digest" },
  // 13:00 UTC Mon–Fri = 07:00 MDT / 06:00 MST.
  //
  // Note the DST asymmetry: this lands at 06:00 through the winter. It
  // is pinned to UTC because Inngest crons are, and a fixed 07:00 MT
  // would need two schedules. Arriving an hour early in winter is the
  // harmless side of the trade; arriving an hour late would mean the
  // briefing lands after the day has started.
  { cron: "0 13 * * 1-5" },
  async ({ step }) => {
    return step.run("digest", async () => {
      const { runDailyDigest } = await import("@/lib/ea/digest");
      const { withHeartbeat, gradeSweep } = await import("@/lib/ea/job-runs");
      return withHeartbeat(
        "ea-daily-digest",
        () => runDailyDigest(),
        (r) => r.sent,
        (r) => gradeSweep({ succeeded: r.sent + r.skipped, failed: r.failed }),
      );
    });
  },
);

/* -------------------------- EA: inbox sweep -------------------------- */

export const eaInboxSweep = inngest.createFunction(
  { id: "ea-inbox-sweep" },
  // Fifteen past the hour, EVERY day. Offset from the other hourly jobs
  // so the two are not competing for the same Google rate limit.
  //
  // Seven days, unlike every other EA schedule, because this job does
  // not send anything — it writes a draft into Gmail. The weekday
  // restriction elsewhere exists to stop mail going OUT at odd hours,
  // and a draft disturbs nobody. Meanwhile the cost of waiting is real:
  // a prospect asking for time on Friday evening would otherwise sit
  // untouched until Monday morning, which is the one kind of email where
  // response speed decides whether the meeting happens.
  { cron: "15 * * * *" },
  async ({ step }) => {
    return step.run("sweep", async () => {
      const { runInboxSweep } = await import("@/lib/ea/inbox-triage");
      const { withHeartbeat, gradeSweep } = await import("@/lib/ea/job-runs");
      return withHeartbeat(
        "ea-inbox-sweep",
        () => runInboxSweep(),
        (r) => r.drafted,
        (r) =>
          gradeSweep({ succeeded: r.drafted + r.skipped, failed: r.failed }),
      );
    });
  },
);

/* ------------------------ EA: client chasing ------------------------ */

export const eaClientNudge = inngest.createFunction(
  { id: "ea-client-nudge" },
  // Monday 16:00 UTC = 10:00 MDT / 09:00 MST. Inside the working window
  // year-round, and Monday morning is when a week's commitments are
  // still salvageable.
  { cron: "0 16 * * 1" },
  async ({ step }) => {
    return step.run("nudge", async () => {
      const { runClientNudge } = await import("@/lib/ea/client-nudge");
      const { withHeartbeat, gradeSweep } = await import("@/lib/ea/job-runs");
      return withHeartbeat(
        "ea-client-nudge",
        () => runClientNudge(),
        (r) => r.itemsChased,
        (r) =>
          gradeSweep({ succeeded: r.recipientsEmailed, failed: r.failed }),
      );
    });
  },
);

/* ------------------------ EA: Friday rollup ------------------------ */

export const eaFridayRollup = inngest.createFunction(
  { id: "ea-friday-rollup" },
  // Friday 22:00 UTC = 16:00 MDT / 15:00 MST. Late enough that the week
  // is done, early enough that it is still Friday.
  { cron: "0 22 * * 5" },
  async ({ step }) => {
    return step.run("rollup", async () => {
      const { runFridayRollup } = await import("@/lib/ea/friday-rollup");
      const { withHeartbeat, gradeSweep } = await import("@/lib/ea/job-runs");
      // Records its own heartbeat AFTER rendering, so the rollup it just
      // sent reports last week's run for itself rather than this one.
      // That is correct: the section describes what had happened when the
      // email was written.
      return withHeartbeat(
        "ea-friday-rollup",
        () => runFridayRollup(),
        (r) => r.sent,
        (r) => gradeSweep({ succeeded: r.sent, failed: r.failed }),
      );
    });
  },
);

/* --------------------- Session series horizon --------------------- */

export const sessionSeriesTopUp = inngest.createFunction(
  { id: "session-series-top-up" },
  // Nightly at 08:00 UTC (01:00/02:00 MT — outside Bruce's working
  // window, so a long sweep never competes with real traffic). Keeps
  // every active recurring meeting materialized ~90 days out, so a
  // touch-base defined once keeps producing instances indefinitely.
  //
  // Idempotent: instance creation is guarded by a UNIQUE index on
  // (series_id, series_occurrence_at), so a retry or an overlapping run
  // inserts nothing rather than duplicating meetings.
  { cron: "0 8 * * *" },
  async ({ step }) => {
    return step.run("top-up", async () => {
      const { topUpAllSeries } = await import("@/lib/actions/session-series");
      return topUpAllSeries();
    });
  },
);

export const allFunctions = [
  dueSoonFlush,
  firefliesExtract,
  calendarSync,
  firefliesSync,
  sessionSeriesTopUp,
  eaDailyDigest,
  eaInboxSweep,
  eaClientNudge,
  eaFridayRollup,
];
