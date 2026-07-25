/**
 * Hours per engagement, and what they are actually earning.
 *
 * The question this answers is the one a coaching practice cannot see
 * from its calendar: which client is quietly consuming the most time for
 * the least money. Sessions are visible, focus blocks are visible, the
 * fee is visible — but nobody ever divides one by the other, so the
 * engagement that has drifted from two hours a fortnight to a day a week
 * looks exactly like the one that has not.
 *
 * Two counts, both per engagement:
 *
 *   - **Session hours** — sessions actually HELD (`completed`), summing
 *     `duration_min`. Scheduled and cancelled sessions are not time
 *     spent, so they do not count.
 *   - **Focus-block hours** — approved or completed EA blocks whose end
 *     has passed. A block still in the future is intention, not work. A
 *     block that was proposed and never approved never happened at all.
 *
 * The rate is deliberately conservative in the client's favour: it
 * counts only time the system can actually see. Real hours are higher —
 * email, prep, thinking in the car — so a rate that looks thin here is
 * thinner in life, which is the correct direction for this number to err.
 *
 * Sorted lowest rate first, so the engagement eating the most time for
 * the least fee is the first thing read. Engagements with no fee on
 * record sort last: no fee is not a low rate, it is an unknown one.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import { actionItems, bbsSessions, eaTimeBlocks } from "@/lib/db/schema";
import type { Tx } from "@/lib/db/tenant";
import {
  engagementLabel,
  listEngagementsForRecipient,
  type EaRecipient,
} from "./recipients";
import { EA_TIMEZONE } from "./digest-data";

export type EngagementHours = {
  engagementId: string;
  engagementLabel: string;
  periodSessionHours: number;
  periodBlockHours: number;
  periodTotalHours: number;
  toDateSessionHours: number;
  toDateBlockHours: number;
  toDateTotalHours: number;
  monthlyFeeCents: number | null;
  /** Effective rate over the whole engagement, in dollars. Null when no
   *  fee is recorded, or when no hours have been logged yet. */
  toDateHourlyRate: number | null;
  /** Months the engagement has been running, used for the rate. */
  monthsElapsed: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function loadEngagementHours(
  tx: Tx,
  recipient: EaRecipient,
  periodStart: Date,
  now: Date,
): Promise<EngagementHours[]> {
  const owned = await listEngagementsForRecipient(tx, recipient);
  // listEngagementsForRecipient already excludes the internal workspace,
  // which has no fee and no client to serve.
  if (owned.length === 0) return [];

  const ids = owned.map((e) => e.id);

  const heldSessions = await tx
    .select({
      engagementId: bbsSessions.engagementId,
      scheduledAt: bbsSessions.scheduledAt,
      durationMin: bbsSessions.durationMin,
    })
    .from(bbsSessions)
    .where(
      and(
        inArray(bbsSessions.engagementId, ids),
        eq(bbsSessions.status, "completed"),
      ),
    );

  // Blocks reach an engagement only through their action item. Only
  // blocks whose slot has already passed count as time spent — one still
  // in the future is intention, not work.
  const blockList = await tx
    .select({
      engagementId: actionItems.engagementId,
      start: eaTimeBlocks.proposedStart,
      end: eaTimeBlocks.proposedEnd,
    })
    .from(eaTimeBlocks)
    .innerJoin(actionItems, eq(actionItems.id, eaTimeBlocks.actionItemId))
    .where(
      and(
        inArray(actionItems.engagementId, ids),
        inArray(eaTimeBlocks.status, ["approved", "completed"]),
        lt(eaTimeBlocks.proposedEnd, now),
      ),
    );

  const nowMt = DateTime.fromJSDate(now, { zone: EA_TIMEZONE });

  return owned
    .map((e) => {
      const mySessions = heldSessions.filter((s) => s.engagementId === e.id);
      const myBlocks = blockList.filter((b) => b.engagementId === e.id);

      const sessionHours = (rows: typeof mySessions, since?: Date) =>
        rows
          .filter((s) => (since ? s.scheduledAt >= since : true))
          .reduce((sum, s) => sum + (s.durationMin ?? 0) / 60, 0);

      const blockHours = (rows: typeof myBlocks, since?: Date) =>
        rows
          .filter((b) => (since ? b.end >= since : true))
          .reduce(
            (sum, b) => sum + (b.end.getTime() - b.start.getTime()) / 3_600_000,
            0,
          );

      const periodSession = sessionHours(mySessions, periodStart);
      const periodBlock = blockHours(myBlocks, periodStart);
      const toDateSession = sessionHours(mySessions);
      const toDateBlock = blockHours(myBlocks);
      const toDateTotal = toDateSession + toDateBlock;

      // Months running, from whichever start date is on record. Floored
      // at 1 so a brand new engagement does not divide by zero and report
      // an absurd rate in its first fortnight.
      const started = e.startedAt ?? e.startDate ?? e.createdAt;
      const monthsElapsed = Math.max(
        1,
        Math.round(
          nowMt.diff(DateTime.fromJSDate(started, { zone: EA_TIMEZONE }), "months")
            .months,
        ),
      );

      const feeToDate =
        e.monthlyFeeCents !== null && e.monthlyFeeCents !== undefined
          ? (e.monthlyFeeCents / 100) * monthsElapsed
          : null;

      return {
        engagementId: e.id,
        engagementLabel: engagementLabel(e),
        periodSessionHours: round1(periodSession),
        periodBlockHours: round1(periodBlock),
        periodTotalHours: round1(periodSession + periodBlock),
        toDateSessionHours: round1(toDateSession),
        toDateBlockHours: round1(toDateBlock),
        toDateTotalHours: round1(toDateTotal),
        monthlyFeeCents: e.monthlyFeeCents ?? null,
        toDateHourlyRate:
          feeToDate !== null && toDateTotal > 0
            ? Math.round(feeToDate / toDateTotal)
            : null,
        monthsElapsed,
      };
    })
    .sort((a, b) => {
      // Lowest rate first. Unknown rate (no fee, or no hours yet) sorts
      // last: it is not a bad rate, it is an absent one.
      if (a.toDateHourlyRate === null && b.toDateHourlyRate === null) {
        return b.toDateTotalHours - a.toDateTotalHours;
      }
      if (a.toDateHourlyRate === null) return 1;
      if (b.toDateHourlyRate === null) return -1;
      return a.toDateHourlyRate - b.toDateHourlyRate;
    });
}
