/**
 * Meeting/session → drafted deliverable CORE.
 *
 * Framework-agnostic and Clerk-free on purpose, for exactly the reason
 * `lib/meetings/action-item-extraction.ts` is: this module is imported by a
 * Netlify Background Function (`netlify/functions/draft-deliverable-
 * background.mts`) which runs OUTSIDE the Next.js request runtime and has a
 * 15-minute budget.
 *
 * That budget is the whole point. Drafting a deliverable reads an hour-plus
 * Fireflies transcript AND runs it through Opus for a long-form markdown
 * document — minutes, not seconds. This used to run inline in a server
 * action, which meant Netlify killed the function at its ~26s synchronous
 * ceiling and the browser got a dead action back. That is the "it errors out,
 * try again" the Business Builders were hitting: not a bug in the drafting,
 * just no time to finish it. The action-item extractor was moved to a
 * background function for this same reason; deliverables never were.
 *
 * Everything here runs under `withSystemContext` (no signed-in user): the
 * background function is triggered by an already-authorized server action and
 * guarded by a shared secret. `withEngagementContext` would be WRONG here —
 * it authorizes through `ensureUserProfile()`, which in a background run has
 * no Clerk session, so every engagement would be denied and the job would
 * silently write nothing. Same trap as `topUpAllSeries` and the EA crons.
 */

import { eq } from "drizzle-orm";
import {
  bbsSessions,
  deliverables,
  engagementMeetings,
  soulFiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import {
  deliverableSystemPrompt,
  deliverableUserPrompt,
} from "@/lib/ai/prompts/deliverables";
import {
  fetchTranscript,
  transcriptToPlainText,
} from "@/lib/integrations/fireflies";
import {
  DELIVERABLE_TYPE_LABEL,
  type DeliverableType,
} from "@/lib/deliverables/types";

/**
 * Output budget for the draft.
 *
 * Was 8000, which is roughly 25 pages of markdown — comfortably enough for a
 * short SOP and NOT enough for a business plan or a marketing plan drafted off
 * a two-hour session. When the model ran out of budget mid-document the draft
 * simply stopped, which read to the Builder as "it missed things from the
 * meeting". It hadn't missed them; it never got to them. The background
 * function has the wall-clock to spend, so the cap is raised well clear of any
 * realistic deliverable and `stop_reason` is now checked rather than assumed.
 */
const DRAFT_MAX_TOKENS = 32_000;

/**
 * Transcript characters handed to the model.
 *
 * A two-hour BBS runs ~120k characters, so the previous 200k default rarely
 * bit — but when it did it dropped the END of the meeting silently, which is
 * where decisions and commitments live. We keep a generous cap (Opus has the
 * context for it) and, when it does trip, say so in the draft rather than
 * quietly losing the last half hour.
 */
const TRANSCRIPT_MAX_CHARS = 400_000;

export type DeliverableDraftResult = {
  deliverableId: string;
  title: string;
  meetingTitle: string;
  /** True when the transcript was long enough to be cut short. */
  transcriptTruncated: boolean;
  /** True when the model hit the output cap — draft may end mid-thought. */
  outputTruncated: boolean;
};

type CoreArgs = {
  engagementId: string;
  orgId: string;
  recordingId: string;
  type: DeliverableType;
  titleOverride?: string | null;
};

/**
 * Fetch the transcript + Soul File, draft the deliverable with Claude, and
 * insert it as `in_progress`. Throws on any hard failure; the background
 * function logs it.
 */
export async function runDeliverableDraft(
  args: CoreArgs,
): Promise<DeliverableDraftResult> {
  const { engagementId, orgId, recordingId, type } = args;

  const soulFileBody = await withSystemContext(async (tx) => {
    const [sf] = await tx
      .select({ body: soulFiles.body })
      .from(soulFiles)
      .where(eq(soulFiles.engagementId, engagementId))
      .limit(1);
    return sf?.body ?? "";
  });

  const transcript = await fetchTranscript(recordingId);
  if (!transcript) {
    throw new Error(
      `Fireflies returned no transcript for recording ${recordingId}.`,
    );
  }

  const meetingDate = new Date(transcript.date).toISOString().slice(0, 10);
  const transcriptText = transcriptToPlainText(transcript, {
    maxChars: TRANSCRIPT_MAX_CHARS,
  });
  // `transcriptToPlainText` stops appending once it passes the cap, so a
  // shorter result than the raw sentence total means we lost the tail.
  const rawLength = transcript.sentences.reduce(
    (n, s) => n + (s.speaker_name ?? "Unknown").length + 2 + s.text.length + 1,
    0,
  );
  const transcriptTruncated = rawLength > TRANSCRIPT_MAX_CHARS;

  const title =
    args.titleOverride ??
    `${DELIVERABLE_TYPE_LABEL[type]} — from ${transcript.title}`;

  const result = await complete({
    system: deliverableSystemPrompt(type),
    user: deliverableUserPrompt({
      title,
      type,
      soulFileBody,
      extraContext:
        `This deliverable should be drafted from the following Business ` +
        `Building Session transcript. Pull concrete facts, decisions, ` +
        `numbers, names, and commitments straight from what was said — ` +
        `don't invent details the meeting didn't cover.\n\n` +
        `COVERAGE MATTERS MORE THAN BREVITY. Work through the whole ` +
        `transcript from start to finish and carry across EVERY item that ` +
        `belongs in this deliverable — including anything raised late in ` +
        `the meeting, mentioned only once, or agreed in passing. Do not ` +
        `summarise a list down to its highlights, and do not stop early ` +
        `for length. If something was discussed and it fits the ` +
        `deliverable type, it goes in.\n\n` +
        (transcriptTruncated
          ? `NOTE: this transcript was long enough to be cut short, so the ` +
            `final stretch of the meeting is not included below. Draft from ` +
            `what you have.\n\n`
          : "") +
        `**Meeting:** ${transcript.title} (${meetingDate})\n\n` +
        `**Transcript:**\n\n${transcriptText}`,
    }),
    model: "claude-opus-4-8",
    maxTokens: DRAFT_MAX_TOKENS,
  });

  const outputTruncated = result.stopReason === "max_tokens";

  // Header so the reviewer knows this is an AI first draft and where it came
  // from. Any coverage caveat is stated here too — a Builder must be able to
  // see that a draft is short because it was cut off, not because the meeting
  // was thin.
  const stamp = new Date().toLocaleString();
  const caveats: string[] = [];
  if (transcriptTruncated) {
    caveats.push(
      "The transcript was too long to send in full, so the last part of the meeting isn't reflected here.",
    );
  }
  if (outputTruncated) {
    caveats.push(
      "This draft hit the length limit and may stop mid-section — regenerate or finish it by hand.",
    );
  }
  const description =
    `> _Drafted by Claude from **${transcript.title}** (${meetingDate}) on ${stamp}. ` +
    `Review and edit before delivering to the client._` +
    (caveats.length ? `\n>\n> _⚠ ${caveats.join(" ")}_` : "") +
    `\n\n---\n\n${result.text}`;

  const deliverableId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(deliverables)
      .values({
        orgId,
        engagementId,
        type,
        title,
        description,
        status: "in_progress",
      })
      .returning({ id: deliverables.id });
    return row.id;
  });

  return {
    deliverableId,
    title,
    meetingTitle: transcript.title,
    transcriptTruncated,
    outputTruncated,
  };
}

/** Resolve a Meetings-library row to the args the drafter needs. */
export async function resolveMeetingDraftTarget(meetingId: string): Promise<{
  engagementId: string;
  orgId: string;
  recordingId: string;
}> {
  return withSystemContext(async (tx) => {
    const [m] = await tx
      .select({
        engagementId: engagementMeetings.engagementId,
        orgId: engagementMeetings.orgId,
        recordingId: engagementMeetings.firefliesTranscriptId,
      })
      .from(engagementMeetings)
      .where(eq(engagementMeetings.id, meetingId))
      .limit(1);
    if (!m) throw new Error(`Meeting ${meetingId} not found.`);
    if (!m.recordingId) {
      throw new Error(
        `Meeting ${meetingId} has no Fireflies transcript id on file.`,
      );
    }
    return { ...m, recordingId: m.recordingId };
  });
}

/** Resolve a BBS session to the args the drafter needs. */
export async function resolveSessionDraftTarget(sessionId: string): Promise<{
  engagementId: string;
  orgId: string;
  recordingId: string;
}> {
  return withSystemContext(async (tx) => {
    const [s] = await tx
      .select({
        engagementId: bbsSessions.engagementId,
        orgId: bbsSessions.orgId,
        recordingId: bbsSessions.firefliesRecordingId,
      })
      .from(bbsSessions)
      .where(eq(bbsSessions.id, sessionId))
      .limit(1);
    if (!s) throw new Error(`Session ${sessionId} not found.`);
    if (!s.recordingId) {
      throw new Error(
        `Session ${sessionId} has no Fireflies recording id on file.`,
      );
    }
    return { ...s, recordingId: s.recordingId };
  });
}
