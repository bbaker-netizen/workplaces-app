/**
 * BBS Sessions — read queries (server-side only).
 *
 * Mutations live in `lib/actions/bbs-sessions.ts`.
 */

import { and, asc, desc, eq, gt, lte, ne } from "drizzle-orm";
import {
  actionItems,
  bbsSessions,
  type BbsSession,
} from "../schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ListedSession = BbsSession;

export async function listEngagementSessions(
  engagementId: string,
): Promise<{ upcoming: ListedSession[]; past: ListedSession[] }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { upcoming: [], past: [] };

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
    const now = new Date();
    const [upcoming, past] = await Promise.all([
      tx
        .select()
        .from(bbsSessions)
        .where(
          and(
            eq(bbsSessions.engagementId, engagementId),
            // Cancelled sessions are removed from every list/calendar view.
            ne(bbsSessions.status, "cancelled"),
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
            ne(bbsSessions.status, "cancelled"),
            lte(bbsSessions.scheduledAt, now),
          ),
        )
        .orderBy(desc(bbsSessions.scheduledAt)),
    ]);
    return { upcoming, past };
      },
    );
  } catch {
    return { upcoming: [], past: [] };
  }
}

export async function getSession(id: string): Promise<ListedSession | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await resolveEngagementIdFromRecord(
    "bbs_sessions",
    id,
  );
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(bbsSessions)
          .where(eq(bbsSessions.id, id))
          .limit(1);
        return row ?? null;
      },
    );
  } catch {
    return null;
  }
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
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
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
      },
    );
  } catch {
    return null;
  }
}

export type SessionActionItem = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  assigneeUserProfileId: string | null;
};

/**
 * Action items linked to this session via `bbs_session_id`.
 *
 * **Drafts are excluded for everyone but a Business Builder, and that
 * filter lives HERE rather than in the page.** This function renders on
 * `/portal/sessions/[id]` — a client-facing page — and it had no draft
 * filter at any layer. The portal's own action-items list does filter,
 * but it does so in the page component, so the rule had to be
 * remembered separately at every call site and this call site forgot.
 *
 * It has never leaked, purely by accident: nothing in the database
 * currently carries a `bbs_session_id`, because both drafting paths were
 * writing only `engagement_meeting_id`. So one bug was masking another,
 * and repairing the link without this filter would have published every
 * unreviewed machine-written draft straight into five clients' portals.
 * A draft is Claude's guess until a Business Builder publishes it; that
 * is the whole point of the status.
 */
export async function listSessionActionItems(
  sessionId: string,
): Promise<SessionActionItem[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  const engagementId = await resolveEngagementIdFromRecord(
    "bbs_sessions",
    sessionId,
  );
  if (!engagementId) return [];
  const isBuilder =
    profile.role === "master_admin" || profile.role === "coach";
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const rows = await tx
          .select({
            id: actionItems.id,
            title: actionItems.title,
            status: actionItems.status,
            dueDate: actionItems.dueDate,
            assigneeUserProfileId: actionItems.assigneeUserProfileId,
          })
          .from(actionItems)
          .where(
            isBuilder
              ? eq(actionItems.bbsSessionId, sessionId)
              : and(
                  eq(actionItems.bbsSessionId, sessionId),
                  ne(actionItems.status, "draft"),
                ),
          )
          .orderBy(asc(actionItems.createdAt));
        return rows;
      },
    );
  } catch {
    return [];
  }
}
