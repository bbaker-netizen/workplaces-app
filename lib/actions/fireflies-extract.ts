"use server";

/**
 * Fireflies → action item drafts pipeline.
 *
 * The full flow per CLAUDE.md "Action Items — Draft / Publish Flow":
 *
 *   1. A client meeting is recorded; Fireflies produces the transcript.
 *   2. The Business Builder clicks "Draft action items from this meeting"
 *      (on the Meetings library or a BBS session). This action fetches the
 *      FULL transcript — not just the Fireflies highlights — runs it through
 *      Claude with the extraction prompt, and inserts each proposed item as a
 *      `draft` action_item with `created_by: claude` and a confidence flag.
 *   3. The Builder reviews the drafts, edits, assigns each to whoever's
 *      appropriate (themselves, a teammate, or the client), and clicks
 *      Publish — which submits it to that person's portal + emails them.
 *
 * Two entry points, one shared core (`draftActionItemsFromRecording`):
 *   - `extractActionItemsFromMeeting` — from a synced meeting in the
 *     engagement's Meetings library (the everyday path).
 *   - `extractActionItemsFromFireflies` — from a BBS session that has a
 *     recording id attached.
 *
 * Authorization: Business Builders only (master_admin / coach). The coach
 * controls extraction, review, and assignment; clients can't pull drafts.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import {
  actionItems,
  bbsSessions,
  engagementMeetings,
  userProfiles,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withSystemContext,
} from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import {
  ACTION_ITEM_EXTRACT_MAX_TOKENS,
  ACTION_ITEM_EXTRACT_SYSTEM,
  actionItemExtractUserPrompt,
  parseExtractorJson,
} from "@/lib/ai/prompts/action-item-extract";
import {
  fetchTranscript,
  transcriptToPlainText,
} from "@/lib/integrations/fireflies";

type Role = UserProfile["role"];
type OkProfile = Extract<
  Awaited<ReturnType<typeof ensureUserProfile>>,
  { status: "ok" }
>;

function canEdit(role: Role): boolean {
  // Business Builders only — the coach controls action-item extraction,
  // creation, and assignment. Clients can't pull drafts from a meeting.
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const llmOutputSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().min(1).max(500),
      description: z.string().max(20000).nullable().optional(),
      assigneeName: z.string().nullable().optional(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      revenueImpact: z.boolean(),
      marginImpact: z.boolean(),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
});

/**
 * Parse the extractor's JSON output. The prompt asks for strict JSON; if the
 * model wrapped it in code fences anyway, strip them before parsing.
 */
function parseExtractorOutput(
  text: string,
  stopReason: string | null,
): z.infer<typeof llmOutputSchema> {
  return llmOutputSchema.parse(parseExtractorJson(text, stopReason));
}

/**
 * Shared drafting core. Given an engagement + a Fireflies recording id,
 * pulls the full transcript, runs the extractor, and inserts each proposed
 * item as a `draft` action item on the engagement. Both entry points (a
 * meeting or a BBS session) resolve down to this. Not exported — "use
 * server" requires every export to be an async action, and this is an
 * internal helper.
 *
 * Every external call (Fireflies, Claude, the DB) is wrapped so a thrown
 * error surfaces as a real inline message instead of throwing out of the
 * server action — an uncaught throw renders the generic "we hit a snag"
 * page with no detail.
 */
async function draftActionItemsFromRecording(args: {
  profile: OkProfile;
  engagementId: string;
  firefliesRecordingId: string;
  /** The BBS session this came from, if any. Null for a Meetings-library
   *  draft. Stored on each item so a session-sourced draft links back. */
  bbsSessionId: string | null;
}): Promise<ActionResult<{ created: number }>> {
  const { profile, engagementId, firefliesRecordingId, bbsSessionId } = args;

  let members: Array<{ id: string; fullName: string; email: string }>;
  let result: Awaited<ReturnType<typeof complete>>;
  try {
    // Members (for assignee name-matching) live in the engagement's owning
    // org; bind to it via withEngagementContext so a coach can read across
    // into the client org.
    members = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) =>
        tx
          .select({
            id: userProfiles.id,
            fullName: userProfiles.fullName,
            email: userProfiles.email,
          })
          .from(userProfiles)
          .where(eq(userProfiles.orgId, boundOrgId)),
    );

    const transcript = await fetchTranscript(firefliesRecordingId);
    if (!transcript) {
      return {
        ok: false,
        error:
          "Fireflies didn't return a transcript for that meeting yet. It can take a few minutes to finish processing after the call ends — try again shortly.",
      };
    }
    const transcriptText = transcriptToPlainText(transcript);

    result = await complete({
      system: ACTION_ITEM_EXTRACT_SYSTEM,
      user: actionItemExtractUserPrompt({
        meetingTitle: transcript.title,
        meetingDate: new Date(transcript.date).toISOString().slice(0, 10),
        transcriptText,
      }),
      model: "claude-sonnet-5",
      maxTokens: ACTION_ITEM_EXTRACT_MAX_TOKENS,
      temperature: 0.1,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let parsedOutput: z.infer<typeof llmOutputSchema>;
  try {
    parsedOutput = parseExtractorOutput(result.text, result.stopReason);
  } catch (e) {
    return {
      ok: false,
      error: `Couldn't parse extractor output: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  if (parsedOutput.items.length === 0) {
    return {
      ok: false,
      error:
        "Claude read the full transcript but didn't find any clear, owned commitments to draft. If you expected some, open the transcript in Fireflies to double-check.",
    };
  }

  // Resolved before the write transaction so a Fireflies-meeting lookup
  // never sits inside it. See the helper for why every draft needs it.
  const engagementMeetingId = await resolveEngagementMeetingId(
    engagementId,
    firefliesRecordingId,
  );

  let created = 0;
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        for (const item of parsedOutput.items) {
          const assigneeId = item.assigneeName
            ? matchAssignee(item.assigneeName, members)
            : null;
          await tx.insert(actionItems).values({
            orgId: boundOrgId,
            engagementId,
            title: item.title,
            description: item.description ?? null,
            status: "draft",
            assigneeUserProfileId: assigneeId,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            revenueImpact: item.revenueImpact,
            marginImpact: item.marginImpact,
            confidenceFlag: item.confidence,
            firefliesTranscriptId: firefliesRecordingId,
            bbsSessionId,
            engagementMeetingId,
            createdBy: "claude",
          });
          created += 1;
        }
      },
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (bbsSessionId) revalidatePath(`/portal/sessions/${bbsSessionId}`);
  revalidatePath("/portal/action-items");
  revalidatePath("/business-builder/action-items");
  return { ok: true, data: { created } };
}

const meetingInputSchema = z.object({
  meetingId: z.string().uuid(),
});

/**
 * Kick off drafting action items from a meeting in the engagement's Meetings
 * library. This is intentionally an ENQUEUE, not the work itself: pulling an
 * hour-plus Fireflies transcript and running it through Claude takes far
 * longer than Netlify's ~26s synchronous-function ceiling, so doing it inline
 * gets the server action killed mid-run and returns `undefined` to the
 * browser. Instead we do the fast checks here, then hand off to a Netlify
 * Background Function (15-min budget) that reads the FULL transcript, extracts
 * the commitments, and writes them as draft action items. The drafts appear
 * under Action items when it finishes (usually under a minute).
 */
export async function extractActionItemsFromMeeting(
  input: z.input<typeof meetingInputSchema>,
): Promise<ActionResult<{ queued: true }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't draft action items." };
  const parsed = meetingInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { meetingId } = parsed.data;

  // Fast pre-flight: confirm the meeting exists and has a transcript before we
  // spend a background invocation on it. Meetings live in the client org, so a
  // system read resolves it.
  let meeting: {
    firefliesTranscriptId: string | null;
    engagementId: string;
  } | null;
  try {
    meeting = await withSystemContext(async (tx) => {
      const [m] = await tx
        .select({
          firefliesTranscriptId: engagementMeetings.firefliesTranscriptId,
          engagementId: engagementMeetings.engagementId,
        })
        .from(engagementMeetings)
        .where(eq(engagementMeetings.id, meetingId))
        .limit(1);
      return m ?? null;
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (!meeting) return { ok: false, error: "Meeting not found." };
  // Per-client access, not just the role gate. Without this any coach
  // could spend Claude credits drafting off another coach's client's
  // transcript by pasting a meeting id — the only check here was
  // "are you a Business Builder".
  if (!(await canCurrentBbAccessEngagement(meeting.engagementId))) {
    return { ok: false, error: "You don't have access to that client." };
  }
  if (!meeting.firefliesTranscriptId) {
    return {
      ok: false,
      error:
        "This meeting has no Fireflies transcript on file. Hit Sync from Fireflies, then try again.",
    };
  }

  // Hand off to the background function. It returns 202 immediately; the
  // extraction continues there with the 15-minute budget.
  const baseUrl =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) {
    return {
      ok: false,
      error:
        "Background drafting isn't configured on the server (missing URL or CRON_SECRET).",
    };
  }
  try {
    const resp = await fetch(
      `${baseUrl}/.netlify/functions/extract-meeting-action-items-background`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meetingId,
          startedByUserProfileId: profile.userProfileId,
        }),
      },
    );
    // Background functions answer 202 Accepted. Anything else means the job
    // never started — surface it rather than pretending it's running.
    if (resp.status !== 202 && !resp.ok) {
      return {
        ok: false,
        error: `Couldn't start the draft job (HTTP ${resp.status}). Try again in a moment.`,
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { ok: true, data: { queued: true } };
}

const sessionInputSchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * Draft action items from a BBS session that has a Fireflies recording id.
 */
export async function extractActionItemsFromFireflies(
  input: z.input<typeof sessionInputSchema>,
): Promise<ActionResult<{ created: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't run extraction." };
  const parsed = sessionInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { sessionId } = parsed.data;

  const engagementId = await resolveEngagementIdFromRecord(
    "bbs_sessions",
    sessionId,
  );
  if (!engagementId) return { ok: false, error: "Session not found." };

  let recordingId: string | null;
  try {
    recordingId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [session] = await tx
          .select({ rec: bbsSessions.firefliesRecordingId })
          .from(bbsSessions)
          .where(eq(bbsSessions.id, sessionId))
          .limit(1);
        return session?.rec ?? null;
      },
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (!recordingId) {
    return {
      ok: false,
      error:
        "This session has no Fireflies recording id. Add one before extracting.",
    };
  }

  return draftActionItemsFromRecording({
    profile,
    engagementId,
    firefliesRecordingId: recordingId,
    bbsSessionId: sessionId,
  });
}

/**
 * The `engagement_meetings` row for a transcript, if we have synced one.
 *
 * Every draft written here MUST carry this link, because the meeting
 * workspace — the page a Business Builder actually reviews drafts on —
 * queries by `engagement_meeting_id` and nothing else. Items written
 * with only `bbs_session_id` and `fireflies_transcript_id` exist,
 * correctly, and render nowhere. That is the same failure this codebase
 * keeps paying for: work that completes and reports success while the
 * surface stays empty.
 *
 * The pair (engagement, transcript) is the same key `getMeetingWorkspace`
 * joins the recap on, and migration 0109 used it to backfill the link for
 * everything written before it existed.
 *
 * `withSystemContext` because the caller may be mid-`withEngagementContext`
 * or running with no session at all (the auto-attach path), and this is a
 * read of a row already established as belonging to this engagement.
 * Returns null rather than throwing — a missing meeting row means the
 * Fireflies sync has not caught up yet, which must not cost the drafts.
 */
async function resolveEngagementMeetingId(
  engagementId: string,
  firefliesTranscriptId: string | null,
): Promise<string | null> {
  if (!firefliesTranscriptId) return null;
  try {
    return await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ id: engagementMeetings.id })
        .from(engagementMeetings)
        .where(
          and(
            eq(engagementMeetings.engagementId, engagementId),
            eq(engagementMeetings.firefliesTranscriptId, firefliesTranscriptId),
          ),
        )
        .limit(1);
      return row?.id ?? null;
    });
  } catch (e) {
    console.error("[fireflies-extract] meeting lookup failed", e);
    return null;
  }
}

function matchAssignee(
  name: string,
  members: Array<{ id: string; fullName: string; email: string }>,
): string | null {
  const lower = name.toLowerCase().trim();
  // Exact full-name match first.
  let match = members.find((m) => m.fullName.toLowerCase() === lower);
  if (match) return match.id;
  // First-name match (the LLM may strip surnames).
  const first = lower.split(/\s+/)[0];
  match = members.find(
    (m) => m.fullName.toLowerCase().split(/\s+/)[0] === first,
  );
  if (match) return match.id;
  return null;
}

/**
 * System-context variant — invoked by the Inngest background worker
 * (no Clerk session). Same logic as `extractActionItemsFromFireflies`
 * minus the role gate, since the Inngest event was emitted by an
 * already-authorized server action.
 */
export async function extractFromFirefliesAsSystem(
  sessionId: string,
): Promise<ActionResult<{ created: number }>> {
  const ctx = await withSystemContext(async (tx) => {
    const [session] = await tx
      .select()
      .from(bbsSessions)
      .where(eq(bbsSessions.id, sessionId))
      .limit(1);
    if (!session) throw new Error("Session not found.");
    if (!session.firefliesRecordingId) {
      throw new Error("This session has no Fireflies recording id.");
    }
    const members = await tx
      .select({
        id: userProfiles.id,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
      })
      .from(userProfiles)
      .where(eq(userProfiles.orgId, session.orgId));
    return { session, members };
  });

  const transcript = await fetchTranscript(ctx.session.firefliesRecordingId!);
  if (!transcript) {
    return {
      ok: false,
      error: "Fireflies didn't return a transcript for that id.",
    };
  }
  const transcriptText = transcriptToPlainText(transcript);

  const result = await complete({
    system: ACTION_ITEM_EXTRACT_SYSTEM,
    user: actionItemExtractUserPrompt({
      meetingTitle: transcript.title,
      meetingDate: new Date(transcript.date).toISOString().slice(0, 10),
      transcriptText,
    }),
    model: "claude-sonnet-5",
    maxTokens: ACTION_ITEM_EXTRACT_MAX_TOKENS,
    temperature: 0.1,
  });

  let parsedOutput: z.infer<typeof llmOutputSchema>;
  try {
    parsedOutput = parseExtractorOutput(result.text, result.stopReason);
  } catch (e) {
    return {
      ok: false,
      error: `Couldn't parse extractor output: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  // Same link as the interactive path. This is the arm the auto-attach
  // uses, so without it every draft produced by a transcript matching
  // itself to a session would be invisible on the review page.
  const engagementMeetingId = await resolveEngagementMeetingId(
    ctx.session.engagementId,
    ctx.session.firefliesRecordingId,
  );

  let created = 0;
  await withSystemContext(async (tx) => {
    for (const item of parsedOutput.items) {
      const assigneeId = item.assigneeName
        ? matchAssignee(item.assigneeName, ctx.members)
        : null;
      await tx.insert(actionItems).values({
        orgId: ctx.session.orgId,
        engagementId: ctx.session.engagementId,
        title: item.title,
        description: item.description ?? null,
        status: "draft",
        assigneeUserProfileId: assigneeId,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        revenueImpact: item.revenueImpact,
        marginImpact: item.marginImpact,
        confidenceFlag: item.confidence,
        firefliesTranscriptId: ctx.session.firefliesRecordingId,
        bbsSessionId: ctx.session.id,
        engagementMeetingId,
        createdBy: "claude",
      });
      created += 1;
    }
  });
  return { ok: true, data: { created } };
}
