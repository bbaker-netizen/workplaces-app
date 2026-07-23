"use server";

/**
 * Fireflies transcript → drafted deliverable.
 *
 * The deliverable sibling of the action-item extractor
 * (`lib/actions/fireflies-extract.ts`). Where that pulls a meeting's
 * to-dos into draft action items, this pulls a meeting into a first
 * draft of one of the nine methodology deliverables — the Business
 * Builder picks WHICH type, Claude drafts it from the transcript plus
 * the engagement's Soul File, and the result lands as a new
 * `in_progress` deliverable the Builder edits and reviews before
 * delivering to the client.
 *
 * Flow per CLAUDE.md "generated in-app, reviewed in the Deliverables
 * module, delivered to the portal":
 *
 *   1. Coach opens a BBS session that has a Fireflies recording id.
 *   2. Picks a deliverable type + (optional) title, clicks "Draft
 *      from this meeting".
 *   3. This action fetches the transcript, runs it through Claude with
 *      the type-specific deliverable prompt, and inserts a new
 *      deliverable in `in_progress` — NOT delivered. The draft body
 *      carries a header naming the source meeting.
 *   4. Coach edits/reviews in the Deliverables module, then sets it to
 *      Delivered when it's ready for the client.
 *
 * Authorization: Business Builders only — deliverables are outputs of
 * the methodology, produced by the coach for the client.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  bbsSessions,
  deliverables,
  engagementMeetings,
  soulFiles,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withSystemContext,
} from "@/lib/db/tenant";
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
  DELIVERABLE_TYPES,
  DELIVERABLE_TYPE_LABEL,
} from "@/lib/deliverables/types";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  // Same gate as the action-item extractor: the coach controls what
  // gets drafted from a meeting. Clients can't pull deliverables.
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const typeEnum = z.enum(DELIVERABLE_TYPES);
type DType = z.infer<typeof typeEnum>;

/**
 * Shared drafting core. Given an engagement, a Fireflies recording id,
 * and a deliverable type, fetches the transcript + Soul File, drafts the
 * deliverable with Claude, and inserts it as `in_progress`. Both entry
 * points (a BBS session, or a meeting from the library) resolve down to
 * this. Not exported — "use server" requires every export to be an async
 * action, and this is an internal helper.
 */
async function draftFromRecording(args: {
  profile: Extract<
    Awaited<ReturnType<typeof ensureUserProfile>>,
    { status: "ok" }
  >;
  engagementId: string;
  firefliesRecordingId: string;
  type: DType;
  titleOverride?: string;
}): Promise<ActionResult<{ id: string; type: string; title: string }>> {
  const { profile, engagementId, firefliesRecordingId, type } = args;

  // Soul File for grounding context (access-checked via the bound context).
  const soulFileBody = await withEngagementContext(
    profile.orgId,
    profile.role,
    engagementId,
    async (tx) => {
      const [sf] = await tx
        .select({ body: soulFiles.body })
        .from(soulFiles)
        .where(eq(soulFiles.engagementId, engagementId))
        .limit(1);
      return sf?.body ?? "";
    },
  );

  // Fetch the transcript via Fireflies.
  const transcript = await fetchTranscript(firefliesRecordingId);
  if (!transcript) {
    return {
      ok: false,
      error: "Fireflies didn't return a transcript for that id.",
    };
  }
  const meetingDate = new Date(transcript.date).toISOString().slice(0, 10);
  const transcriptText = transcriptToPlainText(transcript);

  const title =
    args.titleOverride ??
    `${DELIVERABLE_TYPE_LABEL[type]} — from ${transcript.title}`;

  // Draft the deliverable. The transcript rides in as extra context on
  // top of the Soul File; the type-specific system prompt shapes the
  // output.
  let draftText: string;
  try {
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
          `**Meeting:** ${transcript.title} (${meetingDate})\n\n` +
          `**Transcript:**\n\n${transcriptText}`,
      }),
      model: "claude-opus-4-7",
      maxTokens: 8000,
    });
    draftText = result.text;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Header so the reviewer knows this is an AI first draft and where it
  // came from — mirrors the "Draft generated" stamp on the in-place
  // generator. The deliverable stays in_progress until the Builder
  // reviews, edits, and marks it Delivered.
  const stamp = new Date().toLocaleString();
  const description =
    `> _Drafted by Claude from **${transcript.title}** (${meetingDate}) on ${stamp}. ` +
    `Review and edit before delivering to the client._\n\n---\n\n${draftText}`;

  let createdId: string;
  try {
    createdId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(deliverables)
          .values({
            orgId: boundOrgId,
            engagementId,
            type,
            title,
            description,
            status: "in_progress",
          })
          .returning({ id: deliverables.id });
        return row.id;
      },
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  revalidatePath("/portal/deliverables");
  revalidatePath("/business-builder/deliverables");
  return { ok: true, data: { id: createdId, type, title } };
}

const sessionInputSchema = z.object({
  sessionId: z.string().uuid(),
  type: typeEnum,
  /** Optional override for the deliverable title. When omitted we build
   *  one from the type label + the meeting title. */
  title: z.string().min(1).max(500).optional(),
});

/** Draft a deliverable from a BBS session that has a Fireflies recording id. */
export async function draftDeliverableFromFireflies(
  input: z.input<typeof sessionInputSchema>,
): Promise<ActionResult<{ id: string; type: string; title: string }>> {
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

  const engagementId = await resolveEngagementIdFromRecord(
    "bbs_sessions",
    sessionId,
  );
  if (!engagementId) return { ok: false, error: "Session not found." };

  const recordingId = await withEngagementContext(
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
  if (!recordingId) {
    return {
      ok: false,
      error:
        "This session has no Fireflies recording id. Add one before drafting.",
    };
  }

  return draftFromRecording({
    profile,
    engagementId,
    firefliesRecordingId: recordingId,
    type,
    titleOverride: parsed.data.title,
  });
}

const meetingInputSchema = z.object({
  meetingId: z.string().uuid(),
  type: typeEnum,
  title: z.string().min(1).max(500).optional(),
});

/**
 * Draft a deliverable from a meeting in the engagement's Meetings library
 * (a Fireflies-synced `engagement_meetings` row). Lets the Builder pull a
 * deliverable straight from any recent meeting without wiring it to a BBS
 * session first.
 */
export async function draftDeliverableFromMeeting(
  input: z.input<typeof meetingInputSchema>,
): Promise<ActionResult<{ id: string; type: string; title: string }>> {
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

  // Look up the meeting to get its engagement + transcript id. System
  // context reads across the client org (meetings live in the client
  // org); withEngagementContext below enforces the caller's access when
  // we actually write the deliverable.
  const meeting = await withSystemContext(async (tx) => {
    const [m] = await tx
      .select({
        engagementId: engagementMeetings.engagementId,
        firefliesTranscriptId: engagementMeetings.firefliesTranscriptId,
      })
      .from(engagementMeetings)
      .where(eq(engagementMeetings.id, meetingId))
      .limit(1);
    return m ?? null;
  });
  if (!meeting) return { ok: false, error: "Meeting not found." };

  return draftFromRecording({
    profile,
    engagementId: meeting.engagementId,
    firefliesRecordingId: meeting.firefliesTranscriptId,
    type,
    titleOverride: parsed.data.title,
  });
}
