/**
 * Messages — read queries (server-side only).
 *
 * Mutations live in `lib/actions/messages.ts`. Two surfaces:
 *
 *   - listMessagesForEntity(threadType, parentEntityId)
 *       Loads the thread under one parent entity (action item, the
 *       engagement-leadership thread, or the engagement-team thread).
 *       Audience is checked in the action layer; this query simply
 *       returns rows scoped by RLS.
 *
 *   - listEngagementRecentActivity(engagementId, limit)
 *       Latest N messages across every thread in the engagement, with
 *       parent metadata for navigation. Filters by the caller's audience
 *       so client_employee never sees leadership-thread snippets in the
 *       feed.
 *
 * Coach cross-org gap: same one documented in 1.2 — when a coach views a
 * thread that lives in a CLIENT org, the tenant GUC won't match. Phase
 * 1.3 testing happens entirely in the master org's "Bruce Test"
 * engagement; Phase 1.7 will add a coach-aware tenant helper.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import {
  actionItems,
  messages,
  userProfiles,
  type Message,
} from "../schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";
import {
  THREAD_TYPE,
  canViewThread,
  type ThreadType,
} from "@/lib/communication/audience";

export type ListedMessage = Message & {
  authorName: string;
};

export async function listMessagesForEntity(
  threadType: ThreadType,
  parentEntityId: string,
): Promise<ListedMessage[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (!canViewThread(threadType, profile.role)) return [];

  // Resolve the engagement id so coach roles bind to the right org.
  // For action-item threads, parentEntityId is the action item's id.
  // For engagement-level threads, parentEntityId IS the engagement id.
  let engagementId: string | null;
  if (threadType === THREAD_TYPE.actionItem) {
    engagementId = await resolveEngagementIdFromRecord(
      "action_items",
      parentEntityId,
    );
  } else {
    engagementId = parentEntityId;
  }
  if (!engagementId) return [];

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const rows = await tx
          .select({
            message: messages,
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

        return rows.map((r) => ({
          ...r.message,
          authorName: r.authorName,
        }));
      },
    );
  } catch {
    return [];
  }
}

/**
 * Latest messages across every thread in the engagement, filtered to the
 * caller's audience. Joins onto action_items for the parent title when
 * the parent is an action item.
 */
export type RecentActivityItem = {
  message: ListedMessage;
  parentEntityType: string;
  parentEntityId: string;
  parentTitle: string;
};

export async function listEngagementRecentActivity(
  engagementId: string,
  limit = 20,
): Promise<RecentActivityItem[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  // Audience-allowed thread types for this caller.
  const allowed: string[] = [];
  if (canViewThread(THREAD_TYPE.engagementLeadership, profile.role)) {
    allowed.push(THREAD_TYPE.engagementLeadership);
  }
  if (canViewThread(THREAD_TYPE.engagementTeam, profile.role)) {
    allowed.push(THREAD_TYPE.engagementTeam);
  }
  if (canViewThread(THREAD_TYPE.actionItem, profile.role)) {
    allowed.push(THREAD_TYPE.actionItem);
  }
  if (allowed.length === 0) return [];

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const rows = await tx
          .select({
            message: messages,
            authorName: userProfiles.fullName,
            actionItemTitle: actionItems.title,
          })
          .from(messages)
          .innerJoin(
            userProfiles,
            eq(userProfiles.id, messages.authorUserProfileId),
          )
          .leftJoin(
            actionItems,
            and(
              eq(messages.parentEntityType, THREAD_TYPE.actionItem),
              eq(actionItems.id, messages.parentEntityId),
            ),
          )
          .where(
            and(
              eq(messages.engagementId, engagementId),
              inArray(messages.parentEntityType, allowed),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(limit);

        return rows.map((r) => ({
          message: { ...r.message, authorName: r.authorName },
          parentEntityType: r.message.parentEntityType,
          parentEntityId: r.message.parentEntityId,
          parentTitle:
            r.message.parentEntityType === THREAD_TYPE.actionItem
              ? r.actionItemTitle ?? "Action item"
              : r.message.parentEntityType === THREAD_TYPE.engagementLeadership
                ? "Leadership thread"
                : "Team thread",
        }));
      },
    );
  } catch {
    return [];
  }
}

export async function getMessage(id: string): Promise<ListedMessage | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  const engagementId = await resolveEngagementIdFromRecord("messages", id);
  if (!engagementId) return null;

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select({
            message: messages,
            authorName: userProfiles.fullName,
          })
          .from(messages)
          .innerJoin(
            userProfiles,
            eq(userProfiles.id, messages.authorUserProfileId),
          )
          .where(eq(messages.id, id))
          .limit(1);
        if (!row) return null;
        return { ...row.message, authorName: row.authorName };
      },
    );
  } catch {
    return null;
  }
}
