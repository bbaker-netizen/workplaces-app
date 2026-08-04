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
 *     (master_admin / Coach / client_lead / client_manager) so the
 *     conversation can be cleaned up if a team member misposts. The
 *     row is NOT hard-deleted — body is replaced with a tombstone
 *     marker that the renderer surfaces as "[Message deleted]". Per
 *     Bruce 2026-05-09: WhatsApp-style readability.
 */

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  clientWriteBlocked,
  READ_ONLY_ERROR,
} from "@/lib/server/engagement-guard";
import {
  actionItems,
  documents,
  engagements,
  messageAttachments,
  messages,
  notifications,
  userProfiles,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withSystemContext,
  withTenantContext,
} from "@/lib/db/tenant";
import { resolveEngagementBuilders } from "@/lib/db/queries/engagement-builders";
import {
  THREAD_TYPE,
  canPostInThread,
  canViewThread,
  isKnownThreadType,
  threadTypeLabel,
} from "@/lib/communication/audience";
import { TOMBSTONE_BODY } from "@/lib/communication/tombstone";
import { sendEmailQuietly } from "@/lib/email/send";
import { mentionEmail, newMessageEmail } from "@/lib/email/templates";
import { emitEngagementEvent } from "@/lib/realtime";
import { sendPushToUser } from "@/lib/push/web-push";

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
  /**
   * user_profile UUIDs the author tagged via the @-typeahead. Server
   * validates each id is a real engagement member before persisting,
   * so a tampered client can't inject arbitrary ids.
   */
  mentions: z.array(z.string().uuid()).default([]),
  /**
   * document UUIDs the author attached via the composer paperclip.
   * Server verifies each belongs to the same engagement before
   * creating `message_attachments` rows. Phase 1.5.
   */
  attachments: z.array(z.string().uuid()).default([]),
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
    revalidatePath(`/business-builder/communication/${engagementIdForCommunication}`);
  }
  if (threadType === THREAD_TYPE.actionItem) {
    revalidatePath(`/portal/action-items/${parentEntityId}`);
    revalidatePath(`/business-builder/action-items/${parentEntityId}`);
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

  if (await clientWriteBlocked(profile.role, data.engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  try {
    const txResult = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        // For action-item threads, sanity-check the parent exists in the
        // same engagement the caller claims. RLS already binds to the org;
        // this catches typos.
        let parentTitle: string | null = null;
        if (data.parentEntityType === THREAD_TYPE.actionItem) {
          const [parent] = await tx
            .select({
              engagementId: actionItems.engagementId,
              title: actionItems.title,
            })
            .from(actionItems)
            .where(eq(actionItems.id, data.parentEntityId))
            .limit(1);
          if (!parent) {
            throw new Error("Parent action item not found.");
          }
          if (parent.engagementId !== data.engagementId) {
            throw new Error(
              "Action item belongs to a different engagement.",
            );
          }
          parentTitle = parent.title;
        } else {
          // Engagement-level thread: parent_entity_id MUST equal
          // engagementId.
          if (data.parentEntityId !== data.engagementId) {
            throw new Error(
              "Engagement-level threads use the engagement id as the parent id.",
            );
          }
        }

        // Validate mentions: each must be a real user_profile in the
        // SAME org (RLS already enforces) AND able to view this thread.
        // Self-mentions are dropped (no point notifying yourself).
        let validMentionRecipients: Array<{
          id: string;
          email: string;
          fullName: string;
          role: UserProfile["role"];
        }> = [];
        let messageRecipients: Array<{
          id: string;
          email: string | null;
          fullName: string;
          role: UserProfile["role"];
        }> = [];
        const requested = data.mentions.filter(
          (id) => id !== profile.userProfileId,
        );
        if (requested.length > 0) {
          const candidates = await tx
            .select({
              id: userProfiles.id,
              email: userProfiles.email,
              fullName: userProfiles.fullName,
              role: userProfiles.role,
            })
            .from(userProfiles)
            .where(inArray(userProfiles.id, requested));
          validMentionRecipients = candidates.filter((c) =>
            canViewThread(data.parentEntityType, c.role),
          );
        }
        const mentionIds = validMentionRecipients.map((m) => m.id);

        const [row] = await tx
          .insert(messages)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            parentEntityType: data.parentEntityType,
            parentEntityId: data.parentEntityId,
            body: data.body,
            authorUserProfileId: profile.userProfileId,
            mentions: mentionIds,
          })
          .returning({ id: messages.id });

        // Attachments: validate each document id belongs to this
        // engagement (RLS already scopes to the org), then create one
        // message_attachments row per. A tampered client can't attach
        // documents from a different engagement — the engagementId
        // filter rejects them.
        if (data.attachments.length > 0) {
          const validDocs = await tx
            .select({ id: documents.id })
            .from(documents)
            .where(
              and(
                eq(documents.engagementId, data.engagementId),
                inArray(documents.id, data.attachments),
              ),
            );
          if (validDocs.length > 0) {
            await tx.insert(messageAttachments).values(
              validDocs.map((d) => ({
                messageId: row.id,
                documentId: d.id,
                orgId: boundOrgId,
              })),
            );
          }
        }

        // Fan out: one notification row per mentioned user. We mark
        // `sent_via='in_app'` here unconditionally; the email send
        // happens AFTER the transaction commits so a failed send
        // doesn't roll back the message.
        if (mentionIds.length > 0) {
          await tx.insert(notifications).values(
            mentionIds.map((uid) => ({
              orgId: boundOrgId,
              userProfileId: uid,
              type: "mention" as const,
              parentEntityType: data.parentEntityType,
              parentEntityId: row.id, // points at the message itself
              sentVia: "in_app" as const,
            })),
          );
        }

        // Every other participant who can see this thread gets a plain
        // "new message" notification + email (per-event). Excludes the
        // author and anyone already getting a mention email so nobody is
        // double-notified.
        //
        // Members here are the engagement's (client) org ONLY. The
        // Business Builders sit in the master org and are handled after
        // this transaction commits — see `notifyBuildersOfMessage`. They
        // cannot be folded in here: their notification row needs THEIR
        // org id, and this transaction is bound to the client's, so the
        // RLS WITH CHECK would reject the insert.
        const mentionSet = new Set(mentionIds);
        const orgMembers = await tx
          .select({
            id: userProfiles.id,
            email: userProfiles.email,
            fullName: userProfiles.fullName,
            role: userProfiles.role,
          })
          .from(userProfiles)
          .where(eq(userProfiles.orgId, boundOrgId));
        messageRecipients = orgMembers.filter(
          (m) =>
            m.id !== profile.userProfileId &&
            !mentionSet.has(m.id) &&
            Boolean(m.email) &&
            canViewThread(data.parentEntityType, m.role),
        );
        if (messageRecipients.length > 0) {
          await tx.insert(notifications).values(
            messageRecipients.map((m) => ({
              orgId: boundOrgId,
              userProfileId: m.id,
              type: "message" as const,
              parentEntityType: data.parentEntityType,
              parentEntityId: row.id,
              sentVia: "in_app" as const,
            })),
          );
        }

        // Realtime: notify any SSE subscribers on this engagement.
        await emitEngagementEvent(tx, data.engagementId, "message_created", {
          messageId: row.id,
          threadType: data.parentEntityType,
          parentEntityId: data.parentEntityId,
        });

        return {
          messageId: row.id,
          parentTitle,
          validMentionRecipients,
          messageRecipients,
        };
      },
    );

    // Send mention emails outside the transaction. Best-effort —
    // failures log, don't surface to the user. Working-hours guard
    // inside `sendEmailQuietly` handles outside-hours queueing.
    if (
      txResult.validMentionRecipients.length > 0 ||
      txResult.messageRecipients.length > 0
    ) {
      const authorName = await loadAuthorName(profile);
      const contextLabel =
        data.parentEntityType === THREAD_TYPE.actionItem
          ? `Action item${txResult.parentTitle ? `: ${txResult.parentTitle}` : ""}`
          : `${threadTypeLabel(data.parentEntityType)} thread`;
      const url =
        data.parentEntityType === THREAD_TYPE.actionItem
          ? `/portal/action-items/${data.parentEntityId}`
          : `/portal/communication?tab=${
              data.parentEntityType === THREAD_TYPE.engagementLeadership
                ? "leadership"
                : "team"
            }`;
      await Promise.all([
        // Mentioned users get the "you were mentioned" email…
        ...txResult.validMentionRecipients.map((r) =>
          sendEmailQuietly(
            mentionEmail({
              to: r.email,
              recipientName: r.fullName,
              authorName,
              contextLabel,
              messageBody: data.body,
              url,
            }),
          ),
        ),
        // …everyone else in the thread gets a "new message" email.
        ...txResult.messageRecipients
          .filter((r): r is typeof r & { email: string } => Boolean(r.email))
          .map((r) =>
            sendEmailQuietly(
              newMessageEmail({
                to: r.email,
                recipientName: r.fullName,
                authorName,
                contextLabel,
                messageBody: data.body,
                url,
              }),
            ),
          ),
      ]);
    }

    // The Workplaces side of the conversation.
    //
    // Until now this did not exist: the recipient query above reads
    // `user_profiles` under the BOUND org, and Business Builders live in
    // the master org — so a client posting in Communication notified
    // nobody at Workplaces at all. Confirmed on live data before fixing:
    // one client message had been posted and not a single engagement
    // message notification had ever been written to a Builder. It sat
    // there unread, indistinguishable from a client with nothing to say.
    //
    // Same defect, and the same repair, as the client-raised agenda
    // point: resolve the engagement's OWN coach and write the row with
    // THEIR org id, after the bound transaction has committed.
    await notifyBuildersOfMessage({
      engagementId: data.engagementId,
      authorUserProfileId: profile.userProfileId,
      authorRole: profile.role,
      threadType: data.parentEntityType,
      body: data.body,
      parentTitle: txResult.parentTitle,
    });

    revalidateForParent(
      data.parentEntityType,
      data.parentEntityId,
      data.engagementId,
    );
    return { ok: true, data: { id: txResult.messageId } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Roles that sit on the client side of an engagement. */
const CLIENT_SIDE_ROLES: ReadonlyArray<UserProfile["role"]> = [
  "client_lead",
  "client_manager",
  "client_employee",
];

/**
 * Tell the engagement's Business Builder that their client has posted.
 *
 * Only fires for a message authored by a CLIENT. A Builder posting into
 * their own client's thread should not notify themselves, and notifying
 * the OTHER Builder about a client that is not theirs is precisely the
 * cross-book noise own-book-by-default exists to prevent.
 *
 * Runs under `withSystemContext` after the message transaction has
 * committed: the row must carry the Builder's own (master) org id or the
 * notification bell — which reads under the signed-in user's tenant —
 * will never see it. Best-effort throughout; a failure here must not
 * unwind a message the client has already sent and can already see.
 */
async function notifyBuildersOfMessage(args: {
  engagementId: string;
  authorUserProfileId: string;
  authorRole: UserProfile["role"];
  threadType: string;
  body: string;
  parentTitle: string | null;
}): Promise<void> {
  if (!(CLIENT_SIDE_ROLES as readonly string[]).includes(args.authorRole)) {
    return;
  }
  try {
    const ctx = await withSystemContext(async (tx) => {
      const builders = (
        await resolveEngagementBuilders(tx, args.engagementId)
      ).filter((b) => b.userProfileId !== args.authorUserProfileId);
      if (builders.length === 0) return null;

      const [eng] = await tx
        .select({ name: engagements.name })
        .from(engagements)
        .where(eq(engagements.id, args.engagementId))
        .limit(1);

      const [author] = await tx
        .select({ fullName: userProfiles.fullName })
        .from(userProfiles)
        .where(eq(userProfiles.id, args.authorUserProfileId))
        .limit(1);

      await tx.insert(notifications).values(
        builders.map((b) => ({
          orgId: b.orgId,
          userProfileId: b.userProfileId,
          type: "message" as const,
          // Points at the ENGAGEMENT, not the message: the coach-side
          // thread view is per engagement, and a message has no page of
          // its own on that side.
          parentEntityType: "client_message",
          parentEntityId: args.engagementId,
          sentVia: "both" as const,
        })),
      );

      return {
        builders,
        engagementLabel: eng?.name?.trim() || "A client",
        authorName: author?.fullName ?? "Someone",
      };
    });
    if (!ctx) return;

    const contextLabel =
      args.threadType === THREAD_TYPE.actionItem
        ? `${ctx.engagementLabel} — action item${args.parentTitle ? `: ${args.parentTitle}` : ""}`
        : `${ctx.engagementLabel} — ${threadTypeLabel(args.threadType).toLowerCase()} thread`;
    const url = `/business-builder/communication/${args.engagementId}`;

    await Promise.all(
      ctx.builders.map((b) =>
        sendEmailQuietly(
          newMessageEmail({
            to: b.email,
            recipientName: b.fullName,
            authorName: ctx.authorName,
            contextLabel,
            messageBody: args.body,
            url,
          }),
        ),
      ),
    );

    await Promise.all(
      ctx.builders.map((b) =>
        sendPushToUser(b.userProfileId, {
          title: `${ctx.engagementLabel} sent a message`,
          body: `${ctx.authorName}: ${flattenForPush(args.body)}`,
          url,
          tag: `client-message-${args.engagementId}`,
        }),
      ),
    );
  } catch (e) {
    console.error("[messages] Business Builder notification failed", e);
  }
}

/** Push bodies are one line on a lock screen — strip markup, clamp. */
function flattenForPush(body: string): string {
  const flat = body.replace(/[#*_`>\-\[\]()]/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}

async function loadAuthorName(profile: {
  orgId: string;
  userProfileId: string;
}): Promise<string> {
  try {
    const name = await withTenantContext(profile.orgId, async (tx) => {
      const [row] = await tx
        .select({ fullName: userProfiles.fullName })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);
      return row?.fullName ?? null;
    });
    return name ?? "Someone";
  } catch {
    return "Someone";
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
    const engagementId = await resolveEngagementIdFromRecord("messages", id);
    if (!engagementId) {
      return { ok: false, error: "Message not found." };
    }
    const result = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
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
      },
    );

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
    const engagementId = await resolveEngagementIdFromRecord("messages", id);
    if (!engagementId) {
      return { ok: false, error: "Message not found." };
    }
    const result = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
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
      },
    );

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

