/**
 * Background: draft a deliverable from a meeting or BBS session transcript.
 *
 * The `-background` suffix makes this a Netlify Background Function: it
 * returns 202 immediately and runs for up to 15 minutes. That budget is why
 * it exists — reading an hour-plus Fireflies transcript and having Opus write
 * a long-form deliverable off it blows well past Netlify's ~26s synchronous
 * ceiling, so doing it inside a server action got the function killed mid-run
 * and the browser saw a failed action ("it errors out, try again").
 *
 * Trigger: POST from the deliverable server actions, guarded by
 * `Bearer ${CRON_SECRET}` so the public function URL can't be used to run
 * expensive Claude jobs.
 */

import type { Context } from "@netlify/functions";
import {
  runDeliverableDraft,
  resolveMeetingDraftTarget,
  resolveSessionDraftTarget,
} from "../../lib/deliverables/fireflies-draft";
import type { DeliverableType } from "../../lib/deliverables/types";

type Payload = {
  source?: "meeting" | "session";
  sourceId?: string;
  type?: DeliverableType;
  title?: string | null;
};

export default async (req: Request, _context: Context) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("draft-deliverable: CRON_SECRET not set.");
    return new Response("Not configured", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { source, sourceId, type } = body;
  if (!source || !sourceId || !type) {
    return new Response("Missing source, sourceId or type", { status: 400 });
  }

  // Background functions return 202 immediately; the work continues here and
  // the platform ignores its result, so log outcomes for observability.
  try {
    const target =
      source === "meeting"
        ? await resolveMeetingDraftTarget(sourceId)
        : await resolveSessionDraftTarget(sourceId);

    const result = await runDeliverableDraft({
      ...target,
      type,
      titleOverride: body.title ?? null,
    });

    console.log(
      `draft-deliverable: created "${result.title}" (${result.deliverableId}) ` +
        `from ${source} ${sourceId}` +
        (result.transcriptTruncated ? " [transcript truncated]" : "") +
        (result.outputTruncated ? " [output hit token cap]" : ""),
    );
  } catch (e) {
    console.error(
      `draft-deliverable: failed for ${source} ${sourceId}:`,
      e instanceof Error ? e.message : e,
    );
  }
};
