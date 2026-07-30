/**
 * Finds sessions that have a transcript but no recap yet, and drafts one.
 *
 * Runs off the back of the existing hourly Fireflies sync, which is what
 * makes "within an hour of the transcript landing" true without a second
 * schedule to reason about.
 *
 * **The lookback window is load-bearing.** Without it, the first run
 * after deploy would walk every session ever recorded, draft a recap for
 * each, and send Bruce an approval email per session. A seven-day window
 * plus a per-run cap means the feature starts quietly: it picks up this
 * week's sessions and nothing else. Anything older is deliberately never
 * recapped, because a recap of a session from three months ago is not a
 * recap, it is archaeology.
 *
 * Idempotency is `session_recaps.bbs_session_id` UNIQUE, so a session
 * already recapped is skipped whether or not this query filters it out.
 */

import { and, asc, eq, gt, isNotNull, lt } from "drizzle-orm";
import { bbsSessions, engagements, sessionRecaps } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { generateSessionRecap } from "./session-recap";
import { attachTranscriptsToSessions } from "./transcript-match";

/** How far back a session can be and still earn a recap. */
const LOOKBACK_DAYS = 7;

/** Most recaps drafted in one run. A guard against a surprise backlog. */
const MAX_PER_RUN = 5;

export type RecapSweepResult = {
  considered: number;
  drafted: number;
  skipped: number;
  failed: number;
  /** Transcripts paired to their session by this run. */
  transcriptsAttached: number;
  /**
   * Why the first non-draft happened. A skip is usually benign (no
   * transcript yet), but a run that skips everything for a REASON — the
   * model refusing, a summary that never arrives — must be able to say
   * so, or "no recaps this week" is indistinguishable from "no sessions
   * this week".
   */
  firstError: string | null;
};

export async function runRecapSweep(
  now: Date = new Date(),
): Promise<RecapSweepResult> {
  const out: RecapSweepResult = {
    considered: 0,
    drafted: 0,
    skipped: 0,
    failed: 0,
    transcriptsAttached: 0,
    firstError: null,
  };

  // Pair up transcripts FIRST. Until this ran, the only thing that ever
  // set `fireflies_recording_id` was somebody pasting it in by hand, so
  // a session nobody remembered to annotate never produced a recap at
  // all. Runs after the meetings sync in the same cron, so it always
  // matches against fresh Fireflies data. A failure here must not stop
  // recaps being drafted for sessions that already have an id.
  try {
    const matched = await attachTranscriptsToSessions(now);
    out.transcriptsAttached = matched.attached;
  } catch (e) {
    console.error("[ea] transcript matching failed:", e);
  }

  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        id: bbsSessions.id,
        scheduledAt: bbsSessions.scheduledAt,
        isInternal: engagements.isInternal,
      })
      .from(bbsSessions)
      .innerJoin(engagements, eq(engagements.id, bbsSessions.engagementId))
      .where(
        and(
          isNotNull(bbsSessions.firefliesRecordingId),
          lt(bbsSessions.scheduledAt, now),
          gt(bbsSessions.scheduledAt, cutoff),
        ),
      )
      .orderBy(asc(bbsSessions.scheduledAt));

    // Filter out anything already recapped in one extra read rather than
    // a NOT EXISTS, which keeps the query readable and the set is small.
    const existing = new Set(
      (
        await tx
          .select({ bbsSessionId: sessionRecaps.bbsSessionId })
          .from(sessionRecaps)
      ).map((r) => r.bbsSessionId),
    );

    return rows.filter((r) => !r.isInternal && !existing.has(r.id));
  });

  out.considered = candidates.length;
  if (candidates.length > MAX_PER_RUN) {
    console.warn(
      `[ea] ${candidates.length} sessions are awaiting a recap; drafting ${MAX_PER_RUN} this run and the rest on the next.`,
    );
  }

  for (const session of candidates.slice(0, MAX_PER_RUN)) {
    try {
      const result = await generateSessionRecap(session.id);
      if (!result.ok) {
        out.skipped++;
        // "Waiting for Fireflies" is the ordinary case and not worth
        // reporting; anything else means the pipeline is stuck and the
        // reason has to travel out to the heartbeat.
        if (result.reason !== "no-transcript-content") {
          out.firstError ??= `${session.id}: ${result.reason}`;
        }
      } else if (result.created) out.drafted++;
      else out.skipped++;
    } catch (e) {
      out.failed++;
      const message = e instanceof Error ? e.message : String(e);
      out.firstError ??= `${session.id}: ${message}`;
      console.error(`[ea] recap generation failed for ${session.id}:`, e);
    }
  }

  return out;
}
