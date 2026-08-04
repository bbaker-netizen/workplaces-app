/**
 * The recurring schedule attached to one client engagement.
 *
 * `session_series` has been generic across any engagement since 0084,
 * but nothing ever read it for a client — the only surface was the
 * practice's own touch-base. So a client booked into a Business
 * Builder's calendar every fortnight had a rhythm in Google and nothing
 * in the app, which is why onboarding had no recurring meeting to offer
 * and the first-session check was the only thing standing in for one.
 */

import { and, desc, eq } from "drizzle-orm";
import { sessionSeries } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type EngagementSeries = {
  id: string;
  title: string;
  /** "app" when we generate the dates, "google" when Google owns them. */
  source: string;
  cadence: string | null;
  anchorAt: Date | null;
  durationMin: number | null;
  googleRecurringEventId: string | null;
};

/** Active recurring schedules for this client, newest first. */
export async function listEngagementSeries(
  engagementId: string,
): Promise<EngagementSeries[]> {
  try {
    return await withSystemContext(async (tx) =>
      tx
        .select({
          id: sessionSeries.id,
          title: sessionSeries.title,
          source: sessionSeries.source,
          cadence: sessionSeries.cadence,
          anchorAt: sessionSeries.anchorAt,
          durationMin: sessionSeries.durationMin,
          googleRecurringEventId: sessionSeries.googleRecurringEventId,
        })
        .from(sessionSeries)
        .where(
          and(
            eq(sessionSeries.engagementId, engagementId),
            eq(sessionSeries.active, true),
          ),
        )
        .orderBy(desc(sessionSeries.createdAt)),
    );
  } catch (e) {
    console.error("[engagement-schedule] read failed", engagementId, e);
    return [];
  }
}
