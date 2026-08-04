/**
 * Background: draft action items from a meeting's full transcript.
 *
 * The `-background` suffix makes this a Netlify Background Function: it
 * returns 202 immediately and runs for up to 15 minutes. That budget is why
 * it exists — pulling an hour-plus Fireflies transcript and running it
 * through Claude blows past Netlify's ~26s synchronous-function ceiling, so
 * doing it inside a server action gets the function killed mid-run and the
 * browser receives `undefined`. The Meetings page fires this instead and
 * the drafts appear under Action items when it finishes.
 *
 * Trigger: POST from the `extractActionItemsFromMeeting` server action with
 * `{ meetingId }`, guarded by `Bearer ${CRON_SECRET}` so the public function
 * URL can't be used to run expensive Claude jobs.
 */

import type { Context } from "@netlify/functions";
import { runAndRecordMeetingExtraction } from "../../lib/meetings/action-item-extraction";

export default async (req: Request, _context: Context) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("extract-meeting-action-items: CRON_SECRET not set.");
    return new Response("Not configured", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let meetingId: string | undefined;
  let startedBy: string | null = null;
  try {
    const body = (await req.json()) as {
      meetingId?: string;
      startedByUserProfileId?: string | null;
    };
    meetingId = body.meetingId;
    startedBy = body.startedByUserProfileId ?? null;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!meetingId) {
    return new Response("Missing meetingId", { status: 400 });
  }

  // Background functions return 202 immediately; the work continues here and
  // its result is ignored by the platform. The outcome is now RECORDED as
  // well as logged — a log line here is invisible to the person who
  // pressed the button, which is why a failed run used to look exactly
  // like a session with nothing in it.
  try {
    const { created, meetingTitle } = await runAndRecordMeetingExtraction(
      meetingId,
      startedBy,
    );
    console.log(
      `extract-meeting-action-items: ${created} draft(s) from "${meetingTitle}" (meeting ${meetingId}).`,
    );
  } catch (e) {
    console.error(
      `extract-meeting-action-items: failed for meeting ${meetingId}:`,
      e instanceof Error ? e.message : e,
    );
  }
};
