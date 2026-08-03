/**
 * Meeting → action-item extraction CORE.
 *
 * Framework-agnostic and Clerk-free on purpose: this module is imported by
 * a Netlify Background Function (`netlify/functions/extract-meeting-action-
 * items-background.mts`), which runs OUTSIDE the Next.js request runtime and
 * has a 15-minute budget. That's the whole point — pulling an hour-plus
 * Fireflies transcript and running it through Claude takes far longer than
 * Netlify's ~26s synchronous-function ceiling, so doing it inside a server
 * action returns `undefined` to the browser when the function is killed
 * mid-run. The background function has the time; the server action just
 * enqueues it.
 *
 * Everything here runs under `withSystemContext` (no signed-in user): the
 * background function was triggered by an already-authorized server action,
 * guarded by a shared secret. It writes draft action items to the DB; the
 * Business Builder reviews, assigns, and publishes them from the UI.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { actionItems, engagementMeetings, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { DELIVERABLE_TYPES } from "@/lib/deliverables/types";
import { enqueueDeliverableDraft } from "@/lib/deliverables/enqueue";
import { createDraftPlaceholder } from "@/lib/deliverables/fireflies-draft";
import { complete } from "@/lib/ai/anthropic";
import {
  ACTION_ITEM_EXTRACT_SYSTEM,
  actionItemExtractUserPrompt,
} from "@/lib/ai/prompts/action-item-extract";
import {
  fetchTranscript,
  transcriptToPlainText,
} from "@/lib/integrations/fireflies";

/** One press must not be able to launch nine Opus runs. */
const MAX_DOCUMENTS_PER_RUN = 3;

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
  // The nine documents this session actually calls for. Defaulted to []
  // because "none" is the common and correct answer, and a model that
  // omits the key entirely must not fail the whole extraction — the
  // action items are the more important half of the output.
  documents: z
    .array(
      z.object({
        type: z.enum(DELIVERABLE_TYPES),
        title: z.string().min(1).max(500),
        reason: z.string().max(1000).optional(),
      }),
    )
    .default([]),
});

/** Strip any stray code fences the model added and parse to the schema. */
function parseExtractorOutput(text: string): z.infer<typeof llmOutputSchema> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  return llmOutputSchema.parse(JSON.parse(cleaned));
}

/** Best-effort match of an LLM-supplied name to an org member's profile id. */
function matchAssignee(
  name: string,
  members: Array<{ id: string; fullName: string }>,
): string | null {
  const lower = name.toLowerCase().trim();
  let match = members.find((m) => m.fullName.toLowerCase() === lower);
  if (match) return match.id;
  const first = lower.split(/\s+/)[0];
  match = members.find(
    (m) => m.fullName.toLowerCase().split(/\s+/)[0] === first,
  );
  return match ? match.id : null;
}

export type MeetingExtractionResult = {
  created: number;
  /** Documents the transcript called for that actually started drafting. */
  documentsQueued: number;
  /** How many it named, before the per-run cap. */
  documentsIdentified: number;
  meetingTitle: string;
};

/**
 * Pull the full transcript for a synced meeting, extract owned commitments,
 * and insert each as a `draft` action item on that meeting's engagement.
 * Throws on any hard failure (meeting missing, no transcript id, Fireflies
 * or Claude error) — the background function logs it.
 */
export async function runMeetingActionItemExtraction(
  meetingId: string,
): Promise<MeetingExtractionResult> {
  // Resolve the meeting + its engagement's members up front.
  const ctx = await withSystemContext(async (tx) => {
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
    const members = await tx
      .select({ id: userProfiles.id, fullName: userProfiles.fullName })
      .from(userProfiles)
      .where(eq(userProfiles.orgId, m.orgId));
    return { ...m, recordingId: m.recordingId, members };
  });

  const transcript = await fetchTranscript(ctx.recordingId);
  if (!transcript) {
    throw new Error(
      `Fireflies returned no transcript for recording ${ctx.recordingId}.`,
    );
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
    maxTokens: 4000,
    temperature: 0.1,
  });

  const parsed = parseExtractorOutput(result.text);

  let created = 0;
  await withSystemContext(async (tx) => {
    for (const item of parsed.items) {
      const assigneeId = item.assigneeName
        ? matchAssignee(item.assigneeName, ctx.members)
        : null;
      await tx.insert(actionItems).values({
        orgId: ctx.orgId,
        engagementId: ctx.engagementId,
        title: item.title,
        description: item.description ?? null,
        status: "draft",
        assigneeUserProfileId: assigneeId,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        revenueImpact: item.revenueImpact,
        marginImpact: item.marginImpact,
        confidenceFlag: item.confidence,
        firefliesTranscriptId: ctx.recordingId,
        // Ties the commitment to the meeting it came out of, so it
        // appears in that meeting's workspace rather than only in the
        // flat action-items list.
        engagementMeetingId: meetingId,
        bbsSessionId: null,
        createdBy: "claude",
      });
      created += 1;
    }
  });

  // Then the documents the session called for. The Business Builder no
  // longer picks a type from a dropdown before pressing the button —
  // the transcript already knows what the session produced, and asking
  // someone to name it in advance was asking them to remember what they
  // had just been in the room for.
  //
  // Capped at 3 regardless of what the model returns. Each document is
  // a multi-minute Opus run, and one press must not be able to launch
  // nine of them.
  const wanted = parsed.documents.slice(0, MAX_DOCUMENTS_PER_RUN);
  let documentsQueued = 0;
  for (const doc of wanted) {
    try {
      // The placeholder row is created FIRST, same reasoning as the
      // manual path: a background function answers 202 before its
      // handler runs, so a job that dies early would otherwise leave no
      // trace at all. The row is the receipt.
      const deliverableId = await createDraftPlaceholder({
        engagementId: ctx.engagementId,
        orgId: ctx.orgId,
        type: doc.type,
        title: doc.title,
        engagementMeetingId: meetingId,
      });
      const failure = await enqueueDeliverableDraft({
        source: "meeting",
        sourceId: meetingId,
        type: doc.type,
        title: doc.title,
        deliverableId,
      });
      if (failure) {
        // Don't abandon the run: the action items are already written
        // and the other documents may still start. The placeholder row
        // stays and says it never finished, which is the diagnosis.
        console.error(
          `Document draft for meeting ${meetingId} (${doc.type}) didn't start: ${failure}`,
        );
        continue;
      }
      documentsQueued += 1;
    } catch (e) {
      console.error(
        `Document draft for meeting ${meetingId} (${doc.type}) failed to queue:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return {
    created,
    documentsQueued,
    documentsIdentified: parsed.documents.length,
    meetingTitle: transcript.title,
  };
}
