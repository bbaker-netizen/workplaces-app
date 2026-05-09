"use server";

/**
 * Messages — server actions (mutations).
 *
 * Phase 1.3 surface: create / update / delete on a single thread per
 * parent entity. @mention parsing + email fan-out lands in Phase 1.4.
 *
 * Authorization model:
 *   - Caller must be a known role (anyone but `prospect`).
 *   - Caller's role must satisfy `canPostInThread(threadType)` — that's
 *     the leadership/team/action-item audience check from
 *     `lib/communication/audience.ts`.
 *   - Edit: author only. Delete: author OR a leadership role
 *     (master_admin / coach / client_lead / client_manager) so the
 *     conversation can be cleaned up if a team member misposts. The
 *     row is NOT hard-deleted — body is replaced with a tombstone
 *     marker that the renderer surfaces as "[Message deleted]". Per
 *     Bruce 2026-05-09: WhatsApp-style readability.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  actionItems,
  messages,
  type UserProfile,
} from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";
import {
  THREAD_TYPE,
  canPostInThread,
  isKnownThreadType,
} from "@/lib/communication/audience";
import { TOMBSTONE_BODY } from "@/lib/communication/tombstone";

type Role = UserProfile["role"];

const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];

function isLeadership(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

/* -------------------------------- create -------------------------------- */

const createSchema = z.object({
  engagementId: z.string().uuid(),
  parentEntityType: z.string().min(1),
  parentEntityId: z.string().uuid(),
  body: z
    .string()
    .min(1, "Message can't be empty")
    .max(20000, "Message is too long"),
});

export type CreateMessageInput = z.input<typeof createSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function revalidateForParent(
  threadType: string,
  parentEntityId: string,
  engagementIdForCommunication?: string,
) {
  // The communication page (Recent Activity + general threads) always
  // wants a refresh on any change.
  revalidatePath("/portal/communication");
  if (engagementIdForCommunication) {
    revalidatePath(`/coach/communication/${engagementIdForCommunication}`);
  }
  if (threadType === THREAD_TYPE.actionItem) {
    revalidatePath(`/portal/action-items/${parentEntityId}`);
    revalidatePath(`/coach/action-items/${parentEntityId}`);
  }
}

export async function createMessage(
  input: CreateMessageInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  if (!isKnownThreadType(data.parentEntityType)) {
    return { ok: false, error: "Unknown thread type." };
  }

  if (!canPostInThread(data.parentEntityType, profile.role)) {
    return {
      ok: false,
      error: "Your role can't post in this thread.",
    };
  }

  try {
    const created = await withTenantContext(profile.orgId, async (tx) => {
      // For action-item threads, sanity-check the parent exists in the
      // same engagement the caller claims. RLS already binds to the org;
      // this catches typos.
      if (data.parentEntityType === THREAD_TYPE.actionItem) {
        const [parent] = await tx
          .select({
            engagementId: actionItems.engagementId,
          })
          .from(actionItems)
          .where(eq(actionItems.id, data.parentEntityId))
          .limit(1);
        if (!parent) {
          throw new Error("Parent action item not found.");
        }
        if (parent.engagementId !== data.engagementId) {
          throw new Error("Action item belongs to a different engagement.");
        }
      } else {
        // Engagement-level thread: parent_entity_id MUST equal
        // engagementId (we use the engagement's UUID as the thread key).
        if (data.parentEntityId !== data.engagementId) {
          throw new Error(
            "Engagement-level threads use the engagement id as the parent id.",
          );
        }
      }

      const [row] = await tx
        .insert(messages)
        .values({
          orgId: profile.orgId,
          engagementId: data.engagementId,
          parentEntityType: data.parentEntityType,
          parentEntityId: data.parentEntityId,
          body: data.body,
          authorUserProfileId: profile.userProfileId,
        })
        .returning({ id: messages.id });
      return row;
    });

    revalidateForParent(
      data.parentEntityType,
      data.parentEntityId,
      data.engagementId,
    );
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* -------------------------------- update -------------------------------- */

const updateSchema = z.object({
  body: z.string().min(1).max(20000),
});

export type UpdateMessageInput = z.input<typeof updateSchema>;

export async function updateMessage(
  id: string,
  input: UpdateMessageInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  try {
    const result = await withTenantContext(profile.orgId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);
      if (!existing) {
        throw new Error("Message not found.");
      }
      if (existing.authorUserProfileId !== profile.userProfileId) {
        throw new Error("You can only edit your own messages.");
      }
      if (existing.body === TOMBSTONE_BODY) {
        throw new Error("Deleted messages can't be edited.");
      }

      await tx
        .update(messages)
        .set({
          body: data.body,
          editedAt: new Date(),
        })
        .where(eq(messages.id, id));

      return existing;
    });

    revalidateForParent(
      result.parentEntityType,
      result.parentEntityId,
      result.engagementId,
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* -------------------------------- delete -------------------------------- */

/**
 * Soft-delete: the row stays so the conversation still scrolls, but
 * `body` is replaced with the tombstone sentinel. Author always allowed;
 * leadership roles allowed for moderation.
 */
export async function deleteMessage(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }

  try {
    const result = await withTenantContext(profile.orgId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);
      if (!existing) {
        throw new Error("Message not found.");
      }
      const isAuthor =
        existing.authorUserProfileId === profile.userProfileId;
      if (!isAuthor && !isLeadership(profile.role)) {
        throw new Error("You can't delete this message.");
      }
      if (existing.body === TOMBSTONE_BODY) {
        // Idempotent — already deleted.
        return existing;
      }

      await tx
        .update(messages)
        .set({
          body: TOMBSTONE_BODY,
          editedAt: new Date(),
        })
        .where(eq(messages.id, id));

      return existing;
    });

    revalidateForParent(
      result.parentEntityType,
      result.parentEntityId,
      result.engagementId,
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

