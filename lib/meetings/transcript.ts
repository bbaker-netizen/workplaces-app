/**
 * Transcript body: fetch once, store, reuse.
 *
 * NO `"use server"` — this is a plain module, like
 * `lib/integrations/fireflies-sync.ts`. Every export of a `"use server"`
 * file becomes a browser-reachable POST endpoint, and an unguarded
 * function that bills Fireflies on each call and returns a client's
 * verbatim session must not be one. The guarded wrappers live in
 * `lib/actions/meeting-transcript.ts`.
 *
 * Why lazy rather than in the sync: the hourly sync calls
 * `fetchMeetingDetail`, which deliberately omits sentences because it
 * runs across every engagement. Pulling full bodies there would mean
 * 235 large payloads on the first run and a fresh one every time a
 * meeting is re-synced, to store text most of which nobody ever opens.
 * Fetching on first open costs one call per meeting actually looked at,
 * and `transcript_text` is the cache — the second open is free.
 *
 * Transcripts are immutable once recorded, so there is no staleness
 * problem: a stored body never needs refreshing.
 */

import { eq } from "drizzle-orm";
import { engagementMeetings } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { fetchTranscript, transcriptToPlainText } from "@/lib/integrations/fireflies";

/** Hard cap. A very long session can run past this; the stored body is
 *  truncated with a visible marker rather than silently cut, so nobody
 *  reads a half transcript believing it is whole. */
const MAX_STORED_CHARS = 400_000;

export type TranscriptLoad =
  | { status: "ok"; text: string }
  | { status: "unavailable"; reason: string };

/**
 * Return this meeting's transcript body, fetching and storing it on
 * first request. Callers must have already authorized access to the
 * engagement — this does no permission checking of its own.
 */
export async function ensureTranscriptText(
  meetingId: string,
): Promise<TranscriptLoad> {
  const row = await withSystemContext(async (tx) => {
    const [m] = await tx
      .select({
        id: engagementMeetings.id,
        transcriptText: engagementMeetings.transcriptText,
        firefliesTranscriptId: engagementMeetings.firefliesTranscriptId,
      })
      .from(engagementMeetings)
      .where(eq(engagementMeetings.id, meetingId))
      .limit(1);
    return m ?? null;
  });

  if (!row) return { status: "unavailable", reason: "Meeting not found." };
  if (row.transcriptText) return { status: "ok", text: row.transcriptText };

  let text: string;
  try {
    const transcript = await fetchTranscript(row.firefliesTranscriptId);
    if (!transcript || transcript.sentences.length === 0) {
      return {
        status: "unavailable",
        reason:
          "Fireflies has no transcript body for this recording. It may still be processing.",
      };
    }
    text = transcriptToPlainText(transcript, { maxChars: MAX_STORED_CHARS });
  } catch (e) {
    // Never throw at the caller: a Fireflies outage should degrade the
    // workspace to "transcript unavailable", not blank the whole page
    // and take the follow-through list down with it.
    return {
      status: "unavailable",
      reason: e instanceof Error ? e.message : "Fireflies request failed.",
    };
  }

  // Cache it. A write failure is not fatal — the caller still gets the
  // text this time and the next open simply re-fetches.
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(engagementMeetings)
        .set({ transcriptText: text })
        .where(eq(engagementMeetings.id, meetingId));
    });
  } catch (e) {
    console.error(
      `Failed to cache transcript for meeting ${meetingId}:`,
      e instanceof Error ? e.message : e,
    );
  }

  return { status: "ok", text };
}
