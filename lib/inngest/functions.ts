/**
 * Inngest functions registered against `inngest`. Each one is a
 * background job; the /api/inngest mount serves them to Inngest cloud.
 *
 * Phase 4. Functions:
 *   - dueSoonFlush      — Mon–Fri 09:00 MT email reminder for action
 *                         items due in the next 30h. Mirrors the
 *                         Netlify Scheduled Function from 1.4 (kept
 *                         both in place for now; the Inngest path is
 *                         the long-term home).
 *   - embeddingRefresh  — Nightly. Re-embeds any Soul File whose body
 *                         was updated more than `embedding_updated_at`
 *                         (or has missing chunks).
 *   - adobeOauthRefresh — Hourly. Refreshes Adobe Sign access tokens
 *                         that expire within the next 2 hours.
 *   - firefliesExtract  — Triggered by `bbs.fireflies.attached` event.
 *                         Pulls the transcript + drafts action items
 *                         in the background instead of blocking the
 *                         coach's UI.
 */

import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
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

/* -------------------------- embedding refresh -------------------------- */

export const embeddingRefresh = inngest.createFunction(
  { id: "embedding-refresh" },
  // 04:00 UTC nightly = 21:00–22:00 MT, well outside Bruce's window.
  { cron: "0 4 * * *" },
  async ({ step }) => {
    const enqueued = await step.run("enqueue", async () => {
      return withSystemContext(async (tx) => {
        // `embedding` and `embedding_updated_at` aren't in the Drizzle
        // schema (pgvector not first-class); use raw SQL.
        const result = await tx.execute(
          sql`SELECT id FROM soul_files
              WHERE embedding IS NULL
                 OR embedding_updated_at IS NULL
                 OR updated_at > embedding_updated_at`,
        );
        const rows = (result as unknown as { rows?: Array<{ id: string }> }).rows ?? [];
        return rows.map((r) => r.id);
      });
    });

    if (enqueued.length === 0) return { count: 0 };

    // Fan out one event per Soul File so Inngest can re-embed them in
    // parallel (and retry individually on failure).
    await step.sendEvent(
      "fan-out-soul-file-embed",
      enqueued.map((id) => ({
        name: "soul-file.embed.requested",
        data: { soulFileId: id },
      })),
    );
    return { count: enqueued.length };
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
      // run a system-context shim that reads the coach who created
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

export const allFunctions = [
  dueSoonFlush,
  embeddingRefresh,
  firefliesExtract,
];
