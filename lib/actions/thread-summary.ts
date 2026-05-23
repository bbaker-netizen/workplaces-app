"use server";

/**
 * Thread summarization.
 *
 * Phase 3.4. Click "Summarize" on any thread → Claude reads the
 * recent messages and returns a structured recap (key decisions,
 * open questions, action items implied). Result is returned as
 * markdown — caller decides what to do (display inline, post as a
 * Coach-only message, copy to clipboard).
 */

import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { messages, userProfiles } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import {
  THREAD_TYPE,
  canViewThread,
  isKnownThreadType,
  threadTypeLabel,
} from "@/lib/communication/audience";
import { TOMBSTONE_BODY } from "@/lib/communication/tombstone";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const SUMMARY_SYSTEM = `You are a precise executive assistant for Workplaces, a coaching firm. Summarize the conversation thread you're given.

Output STRICT markdown with these sections (omit any that are empty):

## TL;DR
One sentence — the headline.

## Decisions
Bullet list of decisions reached (who decided what).

## Open questions
Bullet list of questions that didn't get resolved.

## Implied commitments
Bullet list of things people committed to doing (with names + rough timing if mentioned). These are NOT yet action items — Bruce decides what to publish.

## Notable context
Optional. Anything important that doesn't fit above.

Be terse. No preamble. No "the conversation discusses…" framing. Get to the substance.`;

const inputSchema = z.object({
  threadType: z.string(),
  parentEntityId: z.string().uuid(),
});

export async function summarizeThread(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult<{ summary: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const { threadType, parentEntityId } = parsed.data;
  if (!isKnownThreadType(threadType))
    return { ok: false, error: "Unknown thread type." };
  if (!canViewThread(threadType, profile.role))
    return { ok: false, error: "You can't read this thread." };

  // Resolve engagement to bind RLS correctly.
  let engagementId: string | null;
  if (threadType === THREAD_TYPE.actionItem) {
    engagementId = await resolveEngagementIdFromRecord(
      "action_items",
      parentEntityId,
    );
  } else {
    engagementId = parentEntityId;
  }
  if (!engagementId) return { ok: false, error: "Thread not found." };

  const flat = await withEngagementContext(
    profile.orgId,
    profile.role,
    engagementId,
    async (tx) => {
      const rows = await tx
        .select({
          body: messages.body,
          createdAt: messages.createdAt,
          authorName: userProfiles.fullName,
        })
        .from(messages)
        .innerJoin(
          userProfiles,
          eq(userProfiles.id, messages.authorUserProfileId),
        )
        .where(
          and(
            eq(messages.parentEntityType, threadType),
            eq(messages.parentEntityId, parentEntityId),
          ),
        )
        .orderBy(messages.createdAt);
      return rows
        .filter((r) => r.body !== TOMBSTONE_BODY)
        .map(
          (r) =>
            `[${r.createdAt.toISOString().slice(0, 16).replace("T", " ")}] ${r.authorName}: ${r.body}`,
        )
        .join("\n");
    },
  );

  if (!flat.trim()) {
    return {
      ok: false,
      error: "Nothing to summarize — thread is empty.",
    };
  }

  try {
    const result = await complete({
      system: SUMMARY_SYSTEM,
      user: `Thread type: ${threadTypeLabel(threadType)}\n\nMessages:\n\n${flat.slice(0, 80_000)}`,
      model: "claude-sonnet-4-6",
      maxTokens: 2000,
      temperature: 0.2,
    });
    return { ok: true, data: { summary: result.text } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
