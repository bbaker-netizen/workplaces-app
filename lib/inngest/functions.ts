/**
 * Inngest functions registered against `inngest`.
 *
 * ⚠️ THIS IS NOT WHAT RUNS SCHEDULED WORK IN THIS APP. ⚠️
 *
 * Production scheduling is Netlify Scheduled Functions: a thin trigger
 * in `netlify/functions/*.mts` calling a bearer-guarded route under
 * `app/api/cron/*`. Several jobs below (calendar-sync, fireflies-sync)
 * exist in BOTH places, and it is the Netlify pair that fires.
 *
 * This cost a full working day once: the entire Executive Assistant
 * module was built as Inngest functions, deployed green, and never ran
 * a single time. Nothing surfaced the failure, because a job that is
 * never invoked throws no error — the first symptom was an email that
 * did not arrive.
 *
 * **Adding a scheduled job? Add a `netlify/functions/*.mts` trigger and
 * an `app/api/cron/*` route. Do not add it here.** Anything below is
 * either legacy or an event handler kept for reference.
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

/* ------------------------- Fireflies sync -------------------------
 *
 * REMOVED 2026-07-28. This was a dead duplicate of the live Netlify pair
 * (`netlify/functions/fireflies-sync.mts` → `app/api/cron/fireflies-sync`),
 * and it is the duplication itself that caused the outage: the copy here
 * called `syncAllEngagementMeetings` from `lib/actions`, which guards on
 * the Clerk session. When the real Netlify route was written it copied
 * that same import, so the hourly job returned "0 engagements" in
 * milliseconds and no session recap was ever drafted.
 *
 * Deleted rather than repaired, so there is exactly one Fireflies sync
 * and no broken pattern left to copy. The recap sweep it used to carry
 * now lives in the cron route.
 */

/* --------------------- Session series horizon ---------------------
 *
 * REMOVED 2026-07-28. Same fault as the Fireflies sync above, found in
 * the same sweep: this was the ONLY registration for the nightly
 * recurring-meeting top-up, and Inngest does not fire in this app. So it
 * had never run once, and every recurring series was drifting toward the
 * end of its materialized horizon with nothing to say so.
 *
 * Now a real Netlify pair: `netlify/functions/session-series.mts` →
 * `app/api/cron/session-series`, with a heartbeat so a second silent
 * death is visible in the Friday rollup.
 */

export const allFunctions = [
  dueSoonFlush,
  firefliesExtract,
  calendarSync,
];
