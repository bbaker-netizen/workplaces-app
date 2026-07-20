/**
 * Team workspace reads — the internal Team module's data.
 *
 * Everything here is scoped to the internal engagement resolved by
 * lib/db/queries/internal-workspace.ts. Callers must already have
 * confirmed the viewer is an internal role; these functions return
 * empty for anyone else rather than throwing.
 */

import { and, asc, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import {
  actionItems,
  agendaItems,
  bbsSessions,
  sessionSeries,
  userProfiles,
  type BbsSession,
  type SessionSeries,
} from "@/lib/db/schema";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { withEngagementContext } from "@/lib/db/tenant";
import {
  getInternalEngagementId,
  isInternalRole,
} from "@/lib/db/queries/internal-workspace";

export type TeamMeeting = BbsSession & {
  pendingAgendaCount: number;
  openActionCount: number;
};

export type TeamWorkspaceOverview = {
  engagementId: string;
  series: SessionSeries[];
  upcoming: TeamMeeting[];
  past: TeamMeeting[];
};

/** How many past meetings the Team page shows before "show all". */
const PAST_LIMIT = 12;

export async function getTeamWorkspaceOverview(): Promise<TeamWorkspaceOverview | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok" || !isInternalRole(profile.role)) return null;

  const engagementId = await getInternalEngagementId();
  if (!engagementId) return null;

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const now = new Date();

        const series = await tx
          .select()
          .from(sessionSeries)
          .where(
            and(
              eq(sessionSeries.engagementId, engagementId),
              eq(sessionSeries.active, true),
            ),
          )
          .orderBy(asc(sessionSeries.anchorAt));

        const upcomingRows = await tx
          .select()
          .from(bbsSessions)
          .where(
            and(
              eq(bbsSessions.engagementId, engagementId),
              ne(bbsSessions.status, "cancelled"),
              gte(bbsSessions.scheduledAt, now),
            ),
          )
          .orderBy(asc(bbsSessions.scheduledAt));

        const pastRows = await tx
          .select()
          .from(bbsSessions)
          .where(
            and(
              eq(bbsSessions.engagementId, engagementId),
              ne(bbsSessions.status, "cancelled"),
              lt(bbsSessions.scheduledAt, now),
            ),
          )
          .orderBy(desc(bbsSessions.scheduledAt))
          .limit(PAST_LIMIT);

        const all = [...upcomingRows, ...pastRows];
        const ids = all.map((s) => s.id);

        // Two batched reads rather than a count query per meeting.
        // Tallying in JS keeps it to one round-trip each; the row sets
        // here are tens of items, not thousands.
        const pendingCounts = new Map<string, number>();
        const openCounts = new Map<string, number>();
        if (ids.length > 0) {
          const agendaRows = await tx
            .select({
              sessionId: agendaItems.bbsSessionId,
              id: agendaItems.id,
            })
            .from(agendaItems)
            .where(
              and(
                inArray(agendaItems.bbsSessionId, ids),
                eq(agendaItems.status, "pending"),
              ),
            );
          for (const r of agendaRows) {
            pendingCounts.set(
              r.sessionId,
              (pendingCounts.get(r.sessionId) ?? 0) + 1,
            );
          }

          const actionRows = await tx
            .select({
              sessionId: actionItems.bbsSessionId,
              id: actionItems.id,
            })
            .from(actionItems)
            .where(
              and(
                inArray(actionItems.bbsSessionId, ids),
                ne(actionItems.status, "done"),
              ),
            );
          for (const r of actionRows) {
            if (!r.sessionId) continue;
            openCounts.set(
              r.sessionId,
              (openCounts.get(r.sessionId) ?? 0) + 1,
            );
          }
        }

        const decorate = (s: BbsSession): TeamMeeting => ({
          ...s,
          pendingAgendaCount: pendingCounts.get(s.id) ?? 0,
          openActionCount: openCounts.get(s.id) ?? 0,
        });

        return {
          engagementId,
          series,
          upcoming: upcomingRows.map(decorate),
          past: pastRows.map(decorate),
        };
      },
    );
  } catch (e) {
    // Log rather than swallow: an RLS or query failure would otherwise
    // render as an empty workspace, indistinguishable from having none.
    console.error("[team-workspace] read failed", e);
    return null;
  }
}

/**
 * Internal action items grouped by who owes them — the "who owes what"
 * view that makes mutual tasking legible at a glance.
 */
export type TeamCommitment = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  assigneeUserProfileId: string | null;
  assigneeName: string | null;
  agendaItemId: string | null;
  bbsSessionId: string | null;
};

export async function listTeamCommitments(): Promise<TeamCommitment[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok" || !isInternalRole(profile.role)) return [];

  const engagementId = await getInternalEngagementId();
  if (!engagementId) return [];

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
            assigneeName: userProfiles.fullName,
            agendaItemId: actionItems.agendaItemId,
            bbsSessionId: actionItems.bbsSessionId,
          })
          .from(actionItems)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, actionItems.assigneeUserProfileId),
          )
          .where(
            and(
              eq(actionItems.engagementId, engagementId),
              ne(actionItems.status, "done"),
            ),
          )
          .orderBy(asc(actionItems.dueDate), asc(actionItems.createdAt));

        return rows;
      },
    );
  } catch (e) {
    console.error("[team-workspace] read failed", e);
    return [];
  }
}
