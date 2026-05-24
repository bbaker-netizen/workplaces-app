/**
 * Today's pulse — small stat panel rendered in the BusinessBuilder
 * sidebar under the section list.
 *
 * Three numbers Bruce wanted at-a-glance every time he opens the app:
 *
 *   1. Next coaching session — soonest upcoming bbs_session across
 *      every engagement, with the client name. Click → calendar.
 *   2. Overdue action items — count where due_date < now and status
 *      isn't done/draft. Click → action items list.
 *   3. Signatures awaiting completion — signature_envelopes with
 *      status='in_progress'. Click → envelopes list.
 *
 * All three reads use withSystemContext because the sidebar shows
 * everything Bruce can see across every client engagement, not just
 * the one selected in the cookie. Single Promise.all to keep the
 * layout's render fast.
 */

import { and, asc, count, eq, gte, lt, ne, isNotNull } from "drizzle-orm";
import {
  actionItems,
  bbsSessions,
  engagements,
  signatureEnvelopes,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type BusinessBuilderPulse = {
  nextSession: {
    scheduledAt: Date;
    engagementName: string | null;
    type: string;
  } | null;
  overdueActionsCount: number;
  awaitingSignatureCount: number;
};

export async function getBusinessBuilderPulse(): Promise<BusinessBuilderPulse> {
  const now = new Date();
  try {
    const [next, overdue, awaiting] = await withSystemContext(async (tx) => {
      const [nextRows, overdueRows, awaitingRows] = await Promise.all([
        tx
          .select({
            scheduledAt: bbsSessions.scheduledAt,
            type: bbsSessions.type,
            engagementName: engagements.name,
          })
          .from(bbsSessions)
          .leftJoin(
            engagements,
            eq(engagements.id, bbsSessions.engagementId),
          )
          .where(
            and(
              gte(bbsSessions.scheduledAt, now),
              eq(bbsSessions.status, "scheduled"),
            ),
          )
          .orderBy(asc(bbsSessions.scheduledAt))
          .limit(1),
        tx
          .select({ n: count() })
          .from(actionItems)
          .where(
            and(
              isNotNull(actionItems.dueDate),
              lt(actionItems.dueDate, now),
              ne(actionItems.status, "done"),
              ne(actionItems.status, "draft"),
            ),
          ),
        tx
          .select({ n: count() })
          .from(signatureEnvelopes)
          .where(eq(signatureEnvelopes.status, "in_progress")),
      ]);
      return [nextRows[0] ?? null, overdueRows[0]?.n ?? 0, awaitingRows[0]?.n ?? 0] as const;
    });

    return {
      nextSession: next,
      overdueActionsCount: Number(overdue),
      awaitingSignatureCount: Number(awaiting),
    };
  } catch {
    // Pulse failing should never break the sidebar render. Return
    // empty state instead.
    return {
      nextSession: null,
      overdueActionsCount: 0,
      awaitingSignatureCount: 0,
    };
  }
}
