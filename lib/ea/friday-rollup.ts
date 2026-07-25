/**
 * Friday rollup — what shipped, what slipped, both tagged against the
 * quality gate.
 *
 * This is the one report that answers the gate directly. Every entry
 * carries its `revenue_impact` / `margin_impact` flags, and the email
 * counts the items that carried neither. That count is the interesting
 * number: work that moves neither top line nor margin is work that
 * needed a reason to be on the list, and a week with several of them is
 * a week worth looking at.
 *
 * "Shipped" is deliberately generous — action items completed and
 * deliverables delivered both count, because both are things a client
 * received. "Slipped" is anything still open past its date.
 */

import { and, eq, gte, inArray, isNotNull, lt, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import { actionItems, deliverables } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { fridayRollupEmail } from "@/lib/email/templates";
import { EA_TIMEZONE, gatherDigest } from "./digest-data";
import { loadEngagementHours } from "./engagement-hours";
import { loadHeartbeats } from "./job-runs";
import {
  engagementLabel,
  listEaRecipients,
  listEngagementsForRecipient,
} from "./recipients";

export type RollupResult = { sent: number; failed: number };

export async function runFridayRollup(
  now: Date = new Date(),
): Promise<RollupResult> {
  const out: RollupResult = { sent: 0, failed: 0 };
  const builders = await listEaRecipients();

  // Read once for the whole sweep — the heartbeat describes the
  // practice's machinery, not any one Builder's, so every rollup this
  // run carries the same table.
  const heartbeats = await loadHeartbeats(now);

  const nowMt = DateTime.fromJSDate(now, { zone: EA_TIMEZONE });
  const weekStart = nowMt.startOf("week").toJSDate(); // Luxon weeks start Monday
  const startOfToday = nowMt.startOf("day").toJSDate();
  const weekLabel = `the week of ${nowMt.startOf("week").toFormat("d LLLL")}`;

  for (const builder of builders) {
    try {
      const data = await withSystemContext(async (tx) => {
        const owned = await listEngagementsForRecipient(tx, builder);
        const ids = owned.map((e) => e.id);
        const labelById = new Map(owned.map((e) => [e.id, engagementLabel(e)]));
        if (ids.length === 0) return { shipped: [], slipped: [] };

        // Completed this week. `updated_at` is the completion signal —
        // action_items has no completed_at column, and the status is
        // already filtered to done, so the last write is when it closed.
        const doneItems = await tx
          .select({
            title: actionItems.title,
            engagementId: actionItems.engagementId,
            revenueImpact: actionItems.revenueImpact,
            marginImpact: actionItems.marginImpact,
          })
          .from(actionItems)
          .where(
            and(
              inArray(actionItems.engagementId, ids),
              eq(actionItems.status, "done"),
              gte(actionItems.updatedAt, weekStart),
            ),
          );

        const deliveredThisWeek = await tx
          .select({
            title: deliverables.title,
            engagementId: deliverables.engagementId,
            revenueImpact: deliverables.revenueImpact,
            marginImpact: deliverables.marginImpact,
          })
          .from(deliverables)
          .where(
            and(
              inArray(deliverables.engagementId, ids),
              isNotNull(deliverables.deliveredAt),
              gte(deliverables.deliveredAt, weekStart),
            ),
          );

        const overdueItems = await tx
          .select({
            title: actionItems.title,
            engagementId: actionItems.engagementId,
            dueDate: actionItems.dueDate,
            revenueImpact: actionItems.revenueImpact,
            marginImpact: actionItems.marginImpact,
          })
          .from(actionItems)
          .where(
            and(
              inArray(actionItems.engagementId, ids),
              isNotNull(actionItems.dueDate),
              lt(actionItems.dueDate, startOfToday),
              ne(actionItems.status, "done"),
              ne(actionItems.status, "draft"),
            ),
          );

        const lateDeliverables = await tx
          .select({
            title: deliverables.title,
            engagementId: deliverables.engagementId,
            targetDate: deliverables.targetDate,
            revenueImpact: deliverables.revenueImpact,
            marginImpact: deliverables.marginImpact,
          })
          .from(deliverables)
          .where(
            and(
              inArray(deliverables.engagementId, ids),
              isNotNull(deliverables.targetDate),
              lt(deliverables.targetDate, startOfToday),
              inArray(deliverables.status, ["not_started", "in_progress", "review"]),
            ),
          );

        const daysLate = (d: Date | null): number | null =>
          d
            ? Math.floor(
                nowMt
                  .startOf("day")
                  .diff(
                    DateTime.fromJSDate(d, { zone: EA_TIMEZONE }).startOf("day"),
                    "days",
                  ).days,
              )
            : null;

        return {
          shipped: [
            ...doneItems.map((i) => ({
              title: i.title,
              engagementLabel: labelById.get(i.engagementId) ?? "Client",
              revenueImpact: i.revenueImpact,
              marginImpact: i.marginImpact,
            })),
            ...deliveredThisWeek.map((d) => ({
              title: `${d.title} (deliverable)`,
              engagementLabel: labelById.get(d.engagementId) ?? "Client",
              revenueImpact: d.revenueImpact,
              marginImpact: d.marginImpact,
            })),
          ],
          slipped: [
            ...overdueItems.map((i) => ({
              title: i.title,
              engagementLabel: labelById.get(i.engagementId) ?? "Client",
              daysOverdue: daysLate(i.dueDate),
              revenueImpact: i.revenueImpact,
              marginImpact: i.marginImpact,
            })),
            ...lateDeliverables.map((d) => ({
              title: `${d.title} (deliverable)`,
              engagementLabel: labelById.get(d.engagementId) ?? "Client",
              daysOverdue: daysLate(d.targetDate),
              revenueImpact: d.revenueImpact,
              marginImpact: d.marginImpact,
            })),
          ],
        };
      });

      // State of the book. The 7am briefing is deliberately only what
      // Bruce acts on today, so deliverable states, what clients owe,
      // and quiet engagements land here instead. Reuses the digest
      // gatherer rather than re-deriving the same four queries, so the
      // two emails can never disagree about the same facts.
      const { payload } = await withSystemContext((tx) =>
        gatherDigest(tx, builder, now),
      );

      // Hours and their effective rate. Same recipient scoping as
      // everything else — a Builder sees only the clients they own.
      const engagementHours = await withSystemContext((tx) =>
        loadEngagementHours(tx, builder, weekStart, now),
      );

      // A stale job is itself worth an email even in a week with nothing
      // else to report. Silence is the failure mode the heartbeat exists
      // to break, so it must never be suppressed by a quiet week.
      const anyStale = heartbeats.some((h) => h.stale);
      const nothingToSay =
        !anyStale &&
        data.shipped.length === 0 &&
        data.slipped.length === 0 &&
        payload.deliverablesByStatus.length === 0 &&
        payload.clientOverdue.length === 0 &&
        payload.quietEngagements.length === 0;
      if (nothingToSay) continue;

      const result = await sendEmailQuietly(
        fridayRollupEmail({
          to: builder.email,
          recipientName: builder.fullName,
          weekLabel,
          shipped: data.shipped,
          slipped: data.slipped.sort(
            (a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0),
          ),
          deliverablesByStatus: payload.deliverablesByStatus,
          deliverablesPastTarget: payload.deliverablesPastTarget,
          clientOverdue: payload.clientOverdue,
          quietEngagements: payload.quietEngagements,
          engagementHours,
          heartbeats,
        }),
      );
      if (result.delivered) out.sent++;
      else out.failed++;
    } catch (e) {
      out.failed++;
      console.error(`[ea] Friday rollup failed for ${builder.userProfileId}:`, e);
    }
  }

  return out;
}
