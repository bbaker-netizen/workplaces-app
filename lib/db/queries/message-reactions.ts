/**
 * Message reactions — read queries (server-side only).
 *
 * Returns reactions grouped by emoji for one or many messages, with the
 * list of reacting users so the UI can render pill chips with hover
 * tooltips ("Bruce, Jen") and a count.
 *
 * Mutations live in `lib/actions/message-reactions.ts`.
 */

import { eq, inArray } from "drizzle-orm";
import { messageReactions, userProfiles } from "../schema";
import { withEngagementContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ReactionUser = {
  userProfileId: string;
  fullName: string;
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  /** True if the current viewer is one of the reactors. */
  viewerReacted: boolean;
  users: ReactionUser[];
};

export type ReactionsByEmoji = ReactionGroup[];

/**
 * Loads reactions for a set of message ids, grouped by (messageId, emoji).
 * Returns a Map keyed by messageId so callers can attach groups to their
 * own message rows in O(1) lookups.
 *
 * Empty / no-permission callers receive an empty Map. Audience checks
 * happen one layer up (the page/thread already verified the viewer can
 * see these messages); RLS still hard-stops cross-tenant leakage.
 */
export async function listReactionsForMessages(
  messageIds: string[],
  engagementId?: string,
): Promise<Map<string, ReactionsByEmoji>> {
  const result = new Map<string, ReactionsByEmoji>();
  if (messageIds.length === 0) return result;

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runQuery = async (tx: any) =>
    tx
      .select({
        messageId: messageReactions.messageId,
        userProfileId: messageReactions.userProfileId,
        emoji: messageReactions.emoji,
        fullName: userProfiles.fullName,
      })
      .from(messageReactions)
      .innerJoin(
        userProfiles,
        eq(messageReactions.userProfileId, userProfiles.id),
      )
      .where(inArray(messageReactions.messageId, messageIds))
      .orderBy(messageReactions.createdAt);

  type RowShape = {
    messageId: string;
    userProfileId: string;
    emoji: string;
    fullName: string;
  };
  let rows: RowShape[] = [];
  try {
    if (engagementId) {
      rows = await withEngagementContext(
        profile.orgId,
        profile.role,
        engagementId,
        runQuery,
      );
    } else {
      rows = await withTenantContext(profile.orgId, runQuery);
    }
  } catch {
    return result;
  }

  // Group by (messageId, emoji), preserving insertion order (=== reaction
  // creation order) so the chip row reads like a timeline.
  const buckets = new Map<string, Map<string, ReactionGroup>>();
  for (const row of rows) {
    let perMessage = buckets.get(row.messageId);
    if (!perMessage) {
      perMessage = new Map();
      buckets.set(row.messageId, perMessage);
    }
    let group = perMessage.get(row.emoji);
    if (!group) {
      group = {
        emoji: row.emoji,
        count: 0,
        viewerReacted: false,
        users: [],
      };
      perMessage.set(row.emoji, group);
    }
    group.count += 1;
    group.users.push({
      userProfileId: row.userProfileId,
      fullName: row.fullName,
    });
    if (row.userProfileId === profile.userProfileId) {
      group.viewerReacted = true;
    }
  }

  buckets.forEach((perMessage, messageId) => {
    result.set(messageId, Array.from(perMessage.values()));
  });
  return result;
}
