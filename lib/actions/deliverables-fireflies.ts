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
  soulFiles,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
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

const inputSchema = z.object({
  sessionId: z.string().uuid(),
  type: z.enum(DELIVERABLE_TYPES),
  /** Optional override for the deliverable title. When omitted we build
   *  one from the type label + the meeting title. */
  title: z.string().min(1).max(500).optional(),
});

export async function draftDeliverableFromFireflies(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult<{ id: string; type: string; title: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't draft deliverables." };
  const parsed = inputSchema.safeParse(input);
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

  // Load the session (needs a Fireflies recording id) + the engagement's
  // Soul File for grounding context.
  const ctx = await withEngagementContext(
    profile.orgId,
    profile.role,
    engagementId,
    async (tx) => {
      const [session] = await tx
        .select()
        .from(bbsSessions)
        .where(eq(bbsSessions.id, sessionId))
        .limit(1);
      if (!session) throw new Error("Session not found.");
      if (!session.firefliesRecordingId) {
        throw new Error(
          "This session has no Fireflies recording id. Add one before drafting.",
        );
      }
      const [sf] = await tx
        .select({ body: soulFiles.body })
        .from(soulFiles)
        .where(eq(soulFiles.engagementId, engagementId))
        .limit(1);
      return { session, soulFileBody: sf?.body ?? "" };
    },
  );

  // Fetch the transcript via Fireflies.
  const transcript = await fetchTranscript(ctx.session.firefliesRecordingId!);
  if (!transcript) {
    return {
      ok: false,
      error: "Fireflies didn't return a transcript for that id.",
    };
  }
  const meetingDate = new Date(transcript.date).toISOString().slice(0, 10);
  const transcriptText = transcriptToPlainText(transcript);

  const title =
    parsed.data.title ??
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
        soulFileBody: ctx.soulFileBody,
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
