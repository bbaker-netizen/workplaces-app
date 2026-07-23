"use server";

/**
 * Fireflies → action item drafts pipeline.
 *
 * Phase 2.3. The full flow per CLAUDE.md "Action Items — Draft /
 * Publish Flow":
 *
 *   1. Coach pastes a Fireflies transcript id into a BBS session.
 *   2. This action fetches the transcript, runs it through Claude
 *      with the extraction prompt, and inserts each proposed item
 *      as a `draft` action_item with `created_by: claude` and the
 *      confidence flag from the LLM.
 *   3. Coach reviews drafts in the portal (or via the BBS Prep Live
 *      Artifact in Cowork), edits, assigns, and clicks Publish.
 *
 * Authorization: leadership-only.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  actionItems,
  bbsSessions,
  userProfiles,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import {
  ACTION_ITEM_EXTRACT_SYSTEM,
  actionItemExtractUserPrompt,
} from "@/lib/ai/prompts/action-item-extract";
import {
  fetchTranscript,
  transcriptToPlainText,
} from "@/lib/integrations/fireflies";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  // Business Builders only — the coach controls action-item extraction,
  // creation, and assignment. Clients can't pull drafts from a meeting.
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const inputSchema = z.object({
  sessionId: z.string().uuid(),
});

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

export async function extractActionItemsFromFireflies(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult<{ created: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't run extraction." };
  const parsed = inputSchema.safeParse(input);
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
  if (!engagementId)
    return { ok: false, error: "Session not found." };

  // Load session + engagement members, pull the transcript, and run the
  // extraction. All wrapped so a thrown error (missing recording id, a
  // Fireflies API failure / missing FIREFLIES_API_KEY, or a Claude API
  // error) surfaces as a real inline message instead of throwing out of
  // the server action — an uncaught throw renders the generic "we hit a
  // snag" error page with no detail.
  let ctx: {
    session: typeof bbsSessions.$inferSelect;
    members: Array<{ id: string; fullName: string; email: string }>;
  };
  let result: Awaited<ReturnType<typeof complete>>;
  try {
    ctx = await withEngagementContext(
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
            "This session has no Fireflies recording id. Add one before extracting.",
          );
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
      },
    );

    // Fetch transcript via Fireflies API.
    const transcript = await fetchTranscript(
      ctx.session.firefliesRecordingId!,
    );
    if (!transcript) {
      return {
        ok: false,
        error: "Fireflies didn't return a transcript for that id.",
      };
    }
    const transcriptText = transcriptToPlainText(transcript);

    // Run extraction.
    result = await complete({
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
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Parse JSON output. The prompt asks for strict JSON; if the model
  // wrapped it in code fences anyway, strip them.
  let parsedOutput: z.infer<typeof llmOutputSchema>;
  try {
    const cleaned = result.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();
    parsedOutput = llmOutputSchema.parse(JSON.parse(cleaned));
  } catch (e) {
    return {
      ok: false,
      error: `Couldn't parse extractor output: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  // Insert each as a draft action item, mapping assigneeName → id.
  let created = 0;
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        for (const item of parsedOutput.items) {
          const assigneeId = item.assigneeName
            ? matchAssignee(item.assigneeName, ctx.members)
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
            firefliesTranscriptId: ctx.session.firefliesRecordingId,
            bbsSessionId: ctx.session.id,
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

  revalidatePath(`/portal/sessions/${sessionId}`);
  revalidatePath("/portal/action-items");
  revalidatePath("/business-builder/action-items");
  return { ok: true, data: { created } };
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
  const { withSystemContext } = await import("@/lib/db/tenant");

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

  const transcript = await fetchTranscript(
    ctx.session.firefliesRecordingId!,
  );
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
    maxTokens: 4000,
    temperature: 0.1,
  });

  let parsedOutput: z.infer<typeof llmOutputSchema>;
  try {
    const cleaned = result.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();
    parsedOutput = llmOutputSchema.parse(JSON.parse(cleaned));
  } catch (e) {
    return {
      ok: false,
      error: `Couldn't parse extractor output: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

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
        createdBy: "claude",
      });
      created += 1;
    }
  });
  return { ok: true, data: { created } };
}
