"use server";

/**
 * Message reactions — server actions.
 *
 * Phase 1.3.5 surface: toggle a single (message, viewer, emoji) tuple
 * on or off. Adding the same emoji twice is idempotent (the row already
 * exists). Removing a non-existent reaction is also a no-op.
 *
 * Authorization: the viewer must be able to *see* the parent message's
 * thread (per `canViewThread`). If they can see it, they can react —
 * including `client_employee` reacting on team or action-item threads.
 * Reactions on a leadership thread require leadership-tier visibility,
 * mirroring the audience model from 1.3.
 *
 * RLS does the heavy lifting on `message_reactions`: org_id matches
 * the parent message's org_id (we copy it from the parent), so the
 * `auth.org_id()` predicate already prevents cross-tenant writes. The
 * thread-audience check above is the within-tenant guard.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  messageReactions,
  messages,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import {
  THREAD_TYPE,
  canViewThread,
  isKnownThreadType,
} from "@/lib/communication/audience";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const inputSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z
    .string()
    .min(1, "Emoji is required.")
    .max(32, "Emoji string is too long."),
});

export type ToggleReactionInput = z.input<typeof inputSchema>;

function revalidateForParent(
  threadType: string,
  parentEntityId: string,
  engagementId: string,
) {
  revalidatePath("/portal/communication");
  revalidatePath(`/coach/communication/${engagementId}`);
  if (threadType === THREAD_TYPE.actionItem) {
    revalidatePath(`/portal/action-items/${parentEntityId}`);
    revalidatePath(`/coach/action-items/${parentEntityId}`);
  }
}

async function loadParentMessage(
  profile: { orgId: string; role: UserProfile["role"] },
  messageId: string,
) {
  // Resolve engagement first so we can bind to the correct org —
  // important for Business Builder roles posting in client engagements.
  const engagementId = await resolveEngagementIdFromRecord(
    "messages",
    messageId,
  );
  if (!engagementId) return null;
  return withEngagementContext(
    profile.orgId,
    profile.role,
    engagementId,
    async (tx, boundOrgId) => {
      const [row] = await tx
        .select({
          id: messages.id,
          orgId: messages.orgId,
          engagementId: messages.engagementId,
          parentEntityType: messages.parentEntityType,
          parentEntityId: messages.parentEntityId,
        })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);
      return row ? { ...row, boundOrgId } : null;
    },
  );
}

function audienceCheck(
  parentEntityType: string,
  role: UserProfile["role"],
): { ok: true } | { ok: false; error: string } {
  if (!isKnownThreadType(parentEntityType)) {
    return { ok: false, error: "Unknown thread type." };
  }
  if (!canViewThread(parentEntityType, role)) {
    return {
      ok: false,
      error: "Your role can't react in this thread.",
    };
  }
  return { ok: true };
}

/**
 * Toggle: insert if absent, delete if present. Returns the resulting
 * state (`'added'` or `'removed'`) so the optimistic UI knows whether
 * its local prediction was correct.
 */
export async function toggleReaction(
  input: ToggleReactionInput,
): Promise<ActionResult<{ state: "added" | "removed" }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { messageId, emoji } = parsed.data;

  const parent = await loadParentMessage(profile, messageId);
  if (!parent) {
    return { ok: false, error: "Message not found." };
  }

  const audience = audienceCheck(parent.parentEntityType, profile.role);
  if (!audience.ok) return audience;

  try {
    const state = await withEngagementContext(
      profile.orgId,
      profile.role,
      parent.engagementId,
      async (tx, boundOrgId) => {
        const [existing] = await tx
          .select({ messageId: messageReactions.messageId })
          .from(messageReactions)
          .where(
            and(
              eq(messageReactions.messageId, messageId),
              eq(messageReactions.userProfileId, profile.userProfileId),
              eq(messageReactions.emoji, emoji),
            ),
          )
          .limit(1);

        if (existing) {
          await tx
            .delete(messageReactions)
            .where(
              and(
                eq(messageReactions.messageId, messageId),
                eq(messageReactions.userProfileId, profile.userProfileId),
                eq(messageReactions.emoji, emoji),
              ),
            );
          return "removed" as const;
        }

        await tx.insert(messageReactions).values({
          messageId,
          userProfileId: profile.userProfileId,
          emoji,
          orgId: boundOrgId,
        });
        return "added" as const;
      },
    );

    revalidateForParent(
      parent.parentEntityType,
      parent.parentEntityId,
      parent.engagementId,
    );
    return { ok: true, data: { state } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
