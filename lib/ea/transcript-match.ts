/**
 * Attach Fireflies transcripts to the sessions they belong to.
 *
 * The gap this closes: `bbs_sessions.fireflies_recording_id` is what
 * every transcript-driven feature keys off — action-item drafting since
 * Phase 4, session recaps since the EA module — and until now the ONLY
 * thing that ever wrote it was a person pasting the id into the session
 * by hand. So "run a session, get a recap" was really "run a session,
 * remember to paste an id, then get a recap", and anything you forgot
 * simply never happened.
 *
 * The join, and why it is this one:
 *
 *   The original spec proposed matching on Fireflies meeting TITLES
 *   following a naming convention. That makes the whole pipeline depend
 *   on title discipline forever, and it fails silently the first time a
 *   meeting is named slightly differently, which is exactly the kind of
 *   dependency that rots.
 *
 *   `engagement_meetings` already carries the client, the transcript id,
 *   and when the meeting actually happened, refreshed hourly by the
 *   existing Fireflies sync. So we match on **client plus time**: a
 *   session held at 10:00 for Summit Cabinets pairs with the Summit
 *   Cabinets transcript recorded near 10:00. That does not care what the
 *   meeting was called.
 *
 * Three guards keep a wrong pairing from happening:
 *
 *   - The candidate must be for the SAME engagement. Cross-client
 *     matching is impossible by construction.
 *   - It must fall inside a tight window either side of the session, and
 *     the closest candidate wins. A meeting three hours adrift is not
 *     this session.
 *   - A transcript already attached to some other session is never
 *     reused. Two sessions cannot claim one recording.
 *
 * Runs inside the hourly Fireflies cron, after `syncAllEngagementMeetings`
 * has refreshed the meetings table, so it always matches against
 * current data.
 */

import { and, eq, gt, isNotNull, isNull, lt, ne } from "drizzle-orm";
import {
  bbsSessions,
  engagementMeetings,
  engagements,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

/**
 * How far either side of a session's scheduled time a transcript may sit
 * and still be considered the same meeting.
 *
 * Two hours is generous on purpose: a BBS runs two hours, sessions start
 * late, and Fireflies stamps the moment recording began. Being scoped to
 * one client already makes a false pair unlikely, so the window is set
 * to tolerate real-world drift rather than to be the primary defence.
 */
const MATCH_WINDOW_MINUTES = 120;

/**
 * How far back to look for a session that still needs a transcript.
 *
 * **This used to be 7 days, and that was the whole reason almost nothing
 * ever matched.** The hourly Fireflies sync was itself dead until 28 July
 * (see the 2026-07-28 entry in CLAUDE.md), so when it was fixed it
 * backfilled the entire history of `engagement_meetings` in one go — 231
 * transcripts. But this sweep could only see sessions from the previous
 * week, and that particular week happened to contain no matching pairs.
 * Every older session was permanently out of reach: they aged past the
 * window before a transcript for them had ever been synced.
 *
 * Measured against the live database: with a 7-day lookback the sweep
 * attaches 0. With no limit it attaches 56 — sessions that have an
 * unclaimed transcript for the same client sitting within ±2 hours.
 *
 * The window itself was never the problem and is unchanged: widening it
 * from ±60 to ±360 minutes moves the total from 55 to 56 while doubling
 * the ambiguous count, so ±120 is already the right call.
 */
const LOOKBACK_DAYS = 3650;

/**
 * How recent a session must be for attaching its transcript to also
 * DRAFT things off it.
 *
 * Attaching is silent and cheap — one UPDATE — and it is worth doing
 * across all history, because the link feeds drafted agendas, the
 * meetings library, and Soul File search.
 *
 * Drafting is neither. Each attachment triggers action-item extraction,
 * and the recap sweep that follows drafts a recap and emails the coach
 * for approval. Doing that to the whole backfill would have put ~56
 * approval emails in front of Bruce and Jen, most for sessions months
 * old — which is exactly the flood the original 7-day lookback existed
 * to prevent. Bruce's call: backfill the links, leave the history quiet.
 *
 * So the two concerns are now separate rather than conflated into one
 * number. The recap sweep keeps its own 7-day lookback, so a historical
 * attachment produces no recap by the same rule.
 */
const DRAFT_WINDOW_DAYS = 7;

/**
 * Most attachments per run.
 *
 * Raised from 3 now that attaching no longer implies a Claude call for
 * every session. The expensive work is bounded by DRAFT_WINDOW_DAYS
 * instead, so this only limits UPDATE statements — and a backlog of 56
 * that drains three an hour takes most of a day for no reason.
 */
const MAX_ATTACH_PER_RUN = 40;

export type TranscriptMatchResult = {
  considered: number;
  attached: number;
  ambiguousSkipped: number;
  /**
   * Of `attached`, how many were historical — linked but deliberately
   * not drafted from. Counted so the backfill is visible in the logs
   * rather than looking like a burst of new activity.
   */
  backfilledQuietly: number;
};

export async function attachTranscriptsToSessions(
  now: Date = new Date(),
): Promise<TranscriptMatchResult> {
  const out: TranscriptMatchResult = {
    considered: 0,
    attached: 0,
    ambiguousSkipped: 0,
    backfilledQuietly: 0,
  };

  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const draftCutoff = new Date(
    now.getTime() - DRAFT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const windowMs = MATCH_WINDOW_MINUTES * 60 * 1000;

  const work = await withSystemContext(async (tx) => {
    // Sessions that have happened, have no transcript, and are still
    // live (a cancelled session was never held, so it has no recording).
    const orphans = await tx
      .select({
        id: bbsSessions.id,
        engagementId: bbsSessions.engagementId,
        scheduledAt: bbsSessions.scheduledAt,
      })
      .from(bbsSessions)
      .innerJoin(engagements, eq(engagements.id, bbsSessions.engagementId))
      .where(
        and(
          isNull(bbsSessions.firefliesRecordingId),
          lt(bbsSessions.scheduledAt, now),
          gt(bbsSessions.scheduledAt, cutoff),
          ne(bbsSessions.status, "cancelled"),
          ne(engagements.isInternal, true),
        ),
      );

    if (orphans.length === 0) return [];

    // Every transcript already claimed by a session, so one recording can
    // never be attached twice.
    const claimed = new Set(
      (
        await tx
          .select({ id: bbsSessions.firefliesRecordingId })
          .from(bbsSessions)
          .where(isNotNull(bbsSessions.firefliesRecordingId))
      )
        .map((r) => r.id)
        .filter((v): v is string => v !== null),
    );

    const matches: {
      sessionId: string;
      transcriptId: string;
      draft: boolean;
    }[] = [];
    let ambiguous = 0;

    for (const session of orphans) {
      const from = new Date(session.scheduledAt.getTime() - windowMs);
      const to = new Date(session.scheduledAt.getTime() + windowMs);

      const candidates = await tx
        .select({
          transcriptId: engagementMeetings.firefliesTranscriptId,
          occurredAt: engagementMeetings.occurredAt,
        })
        .from(engagementMeetings)
        .where(
          and(
            eq(engagementMeetings.engagementId, session.engagementId),
            gt(engagementMeetings.occurredAt, from),
            lt(engagementMeetings.occurredAt, to),
          ),
        );

      const usable = candidates.filter((c) => !claimed.has(c.transcriptId));
      if (usable.length === 0) continue;

      // Closest in time wins. With more than one in range that is a
      // judgement call rather than a certainty, so it is counted — a
      // rising number here means the window wants narrowing.
      if (usable.length > 1) ambiguous++;

      usable.sort(
        (a, b) =>
          Math.abs(a.occurredAt.getTime() - session.scheduledAt.getTime()) -
          Math.abs(b.occurredAt.getTime() - session.scheduledAt.getTime()),
      );
      const winner = usable[0];

      // Claim it immediately so two sessions in the same run cannot both
      // take the same recording.
      claimed.add(winner.transcriptId);
      matches.push({
        sessionId: session.id,
        transcriptId: winner.transcriptId,
        // Decided here, against the session's own date, so a long
        // backfill can't drift into drafting as it runs.
        draft: session.scheduledAt.getTime() >= draftCutoff.getTime(),
      });
    }

    return [{ orphanCount: orphans.length, matches, ambiguous }];
  });

  if (work.length === 0) return out;
  const { orphanCount, matches, ambiguous } = work[0];
  out.considered = orphanCount;
  out.ambiguousSkipped = ambiguous;

  for (const m of matches.slice(0, MAX_ATTACH_PER_RUN)) {
    try {
      await withSystemContext((tx) =>
        tx
          .update(bbsSessions)
          .set({ firefliesRecordingId: m.transcriptId })
          // Guarded on still being null: if a coach pasted an id by hand
          // between our read and this write, theirs wins.
          .where(
            and(
              eq(bbsSessions.id, m.sessionId),
              isNull(bbsSessions.firefliesRecordingId),
            ),
          ),
      );

      // Draft the action items directly rather than emitting the
      // `bbs.fireflies.attached` Inngest event the manual paste uses.
      //
      // That event is consumed by an Inngest function, and Inngest is
      // NOT what runs scheduled work in this app — every live job is a
      // Netlify Scheduled Function calling a cron route. Emitting it
      // here would have looked correct and done nothing, which is the
      // same mistake that stopped the whole EA module firing.
      //
      // Only for RECENT sessions. A historical backfill gets its link
      // and nothing else: drafting action items and recaps for sessions
      // months old floods the coach's inbox with approvals for work
      // already finished. See DRAFT_WINDOW_DAYS.
      //
      // Best-effort: a failed extraction must not undo the attachment,
      // because the transcript link is useful on its own and the recap
      // sweep runs off it moments later.
      if (m.draft) {
        try {
          const { extractFromFirefliesAsSystem } = await import(
            "@/lib/actions/fireflies-extract"
          );
          await extractFromFirefliesAsSystem(m.sessionId);
        } catch (e) {
          console.error(
            `[ea] action-item extraction failed for ${m.sessionId}:`,
            e,
          );
        }
      } else {
        out.backfilledQuietly++;
      }

      out.attached++;
    } catch (e) {
      console.error(
        `[ea] could not attach transcript to session ${m.sessionId}:`,
        e,
      );
    }
  }

  if (matches.length > MAX_ATTACH_PER_RUN) {
    console.warn(
      `[ea] ${matches.length} sessions matched a transcript; attaching ${MAX_ATTACH_PER_RUN} this run and the rest next hour.`,
    );
  }

  return out;
}
