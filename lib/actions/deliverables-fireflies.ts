"use server";

/**
 * Fireflies transcript → drafted deliverable (enqueue side).
 *
 * The deliverable sibling of the action-item extractor
 * (`lib/actions/fireflies-extract.ts`). Where that pulls a meeting's to-dos
 * into draft action items, this pulls a meeting into a first draft of one of
 * the nine methodology deliverables — the Business Builder picks WHICH type,
 * Claude drafts it from the transcript plus the engagement's Soul File, and
 * the result lands as a new `in_progress` deliverable the Builder edits and
 * reviews before delivering to the client.
 *
 * These actions only AUTHORIZE and ENQUEUE. The drafting itself runs in
 * `netlify/functions/draft-deliverable-background.mts` (core logic in
 * `lib/deliverables/fireflies-draft.ts`), because reading a long transcript
 * and generating a long-form document takes minutes and Netlify kills a
 * synchronous function at ~26 seconds. It used to run inline here, which is
 * why "Draft from this meeting" returned a dead action instead of a
 * deliverable. Same move the action-item extractor already made.
 *
 * Authorization stays HERE, on the signed-in request: role gate plus an
 * engagement-access check. The background function runs under system context
 * and trusts that this ran first — so nothing below may be skipped.
 */

import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { type UserProfile } from "@/lib/db/schema";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import {
  resolveMeetingDraftTarget,
  resolveSessionDraftTarget,
} from "@/lib/deliverables/fireflies-draft";
import { DELIVERABLE_TYPES } from "@/lib/deliverables/types";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  // Same gate as the action-item extractor: the coach controls what gets
  // drafted from a meeting. Clients can't pull deliverables.
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const typeEnum = z.enum(DELIVERABLE_TYPES);

/**
 * Hand off to the background function. Returns an error string on failure,
 * null on success. Not exported — "use server" requires every export to be an
 * async server action.
 */
async function enqueueDraft(payload: {
  source: "meeting" | "session";
  sourceId: string;
  type: string;
  title?: string;
}): Promise<string | null> {
  const baseUrl =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) {
    return "Background drafting isn't configured on the server (missing URL or CRON_SECRET).";
  }
  try {
    const resp = await fetch(
      `${baseUrl}/.netlify/functions/draft-deliverable-background`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    // Background functions answer 202 Accepted. Anything else means the job
    // never started — surface it rather than pretending it's running.
    if (resp.status !== 202 && !resp.ok) {
      return `Couldn't start the drafting job (HTTP ${resp.status}). Try again in a moment.`;
    }
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}

const sessionInputSchema = z.object({
  sessionId: z.string().uuid(),
  type: typeEnum,
  /** Optional override for the deliverable title. When omitted the background
   *  job builds one from the type label + the meeting title. */
  title: z.string().min(1).max(500).optional(),
});

/** Draft a deliverable from a BBS session that has a Fireflies recording id. */
export async function draftDeliverableFromFireflies(
  input: z.input<typeof sessionInputSchema>,
): Promise<ActionResult<{ queued: true }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't draft deliverables." };
  const parsed = sessionInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { sessionId, type } = parsed.data;

  // Fast pre-flight: confirm the session exists and has a recording id before
  // spending a background invocation, and confirm this Builder may touch the
  // engagement it belongs to.
  let engagementId: string;
  try {
    ({ engagementId } = await resolveSessionDraftTarget(sessionId));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!(await canCurrentBbAccessEngagement(engagementId))) {
    return { ok: false, error: "You don't have access to that client." };
  }

  const failure = await enqueueDraft({
    source: "session",
    sourceId: sessionId,
    type,
    title: parsed.data.title,
  });
  if (failure) return { ok: false, error: failure };
  return { ok: true, data: { queued: true } };
}

const meetingInputSchema = z.object({
  meetingId: z.string().uuid(),
  type: typeEnum,
  title: z.string().min(1).max(500).optional(),
});

/**
 * Draft a deliverable from a meeting in the engagement's Meetings library (a
 * Fireflies-synced `engagement_meetings` row). Lets the Builder pull a
 * deliverable straight from any recent meeting without wiring it to a BBS
 * session first.
 */
export async function draftDeliverableFromMeeting(
  input: z.input<typeof meetingInputSchema>,
): Promise<ActionResult<{ queued: true }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't draft deliverables." };
  const parsed = meetingInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { meetingId, type } = parsed.data;

  let engagementId: string;
  try {
    ({ engagementId } = await resolveMeetingDraftTarget(meetingId));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!(await canCurrentBbAccessEngagement(engagementId))) {
    return { ok: false, error: "You don't have access to that client." };
  }

  const failure = await enqueueDraft({
    source: "meeting",
    sourceId: meetingId,
    type,
    title: parsed.data.title,
  });
  if (failure) return { ok: false, error: failure };
  return { ok: true, data: { queued: true } };
}
