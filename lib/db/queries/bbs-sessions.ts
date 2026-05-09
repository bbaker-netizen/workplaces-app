/**
 * BBS Sessions — read queries (server-side only).
 *
 * Mutations live in `lib/actions/bbs-sessions.ts`.
 */

import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import {
  actionItems,
  bbsSessions,
  type BbsSession,
} from "../schema";
import { withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ListedSession = BbsSession;

export async function listEngagementSessions(
  engagementId: string,
): Promise<{ upcoming: ListedSession[]; past: ListedSession[] }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { upcoming: [], past: [] };

  return withTenantContext(profile.orgId, async (tx) => {
    const now = new Date();
    const [upcoming, past] = await Promise.all([
      tx
        .select()
        .from(bbsSessions)
        .where(
          and(
            eq(bbsSessions.engagementId, engagementId),
            gt(bbsSessions.scheduledAt, now),
          ),
        )
        .orderBy(asc(bbsSessions.scheduledAt)),
      tx
        .select()
        .from(bbsSessions)
        .where(
          and(
            eq(bbsSessions.engagementId, engagementId),
            lte(bbsSessions.scheduledAt, now),
          ),
        )
        .orderBy(desc(bbsSessions.scheduledAt)),
    ]);
    return { upcoming, past };
  });
}

export async function getSession(id: string): Promise<ListedSession | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  return withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(bbsSessions)
      .where(eq(bbsSessions.id, id))
      .limit(1);
    return row ?? null;
  });
}

/**
 * Returns the next upcoming session for an engagement, or null if
 * none scheduled. Used by the engagement dashboard widget (Phase 2)
 * but also handy on the sessions page for the "next up" callout.
 */
export async function getNextSession(
  engagementId: string,
): Promise<ListedSession | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  return withTenantContext(profile.orgId, async (tx) => {
    const now = new Date();
    const [row] = await tx
      .select()
      .from(bbsSessions)
      .where(
        and(
          eq(bbsSessions.engagementId, engagementId),
          gt(bbsSessions.scheduledAt, now),
          eq(bbsSessions.status, "scheduled"),
        ),
      )
      .orderBy(asc(bbsSessions.scheduledAt))
      .limit(1);
    return row ?? null;
  });
}

export type SessionActionItem = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  assigneeUserProfileId: string | null;
};

/** Action items linked to this session via `bbs_session_id`. */
export async function listSessionActionItems(
  sessionId: string,
): Promise<SessionActionItem[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  return withTenantContext(profile.orgId, async (tx) => {
    const rows = await tx
      .select({
        id: actionItems.id,
        title: actionItems.title,
        status: actionItems.status,
        dueDate: actionItems.dueDate,
        assigneeUserProfileId: actionItems.assigneeUserProfileId,
      })
      .from(actionItems)
      .where(eq(actionItems.bbsSessionId, sessionId))
      .orderBy(asc(actionItems.createdAt));
    return rows;
  });
}
