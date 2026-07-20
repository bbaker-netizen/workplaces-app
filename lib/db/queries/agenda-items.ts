/**
 * Agenda item reads.
 *
 * Every function is engagement-bound via `withEngagementContext`, so a
 * caller can only ever see agendas for sessions they can reach. Errors
 * resolve to empty rather than throwing, matching the convention in
 * lib/db/queries/bbs-sessions.ts — a failed read renders an empty
 * section instead of a 500 on a page that has other content.
 */

import { asc, eq, inArray } from "drizzle-orm";
import {
  actionItems,
  agendaItems,
  userProfiles,
  type AgendaItem,
} from "@/lib/db/schema";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";

/** An action item that came out of a talking point. */
export type AgendaLinkedAction = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  assigneeUserProfileId: string | null;
  assigneeName: string | null;
};

export type ListedAgendaItem = AgendaItem & {
  raisedByName: string | null;
  /** Set when this item was punted from an earlier meeting. */
  carriedForward: boolean;
  actions: AgendaLinkedAction[];
};

/**
 * Every agenda item on a session, in display order, each with the
 * action items tasked off it.
 *
 * Three queries rather than one join: the agenda, then a batched
 * lookup of linked actions, then a batched name lookup. Keeps the
 * per-item action lists from fanning out into duplicated agenda rows.
 */
export async function listSessionAgenda(
  sessionId: string,
): Promise<ListedAgendaItem[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  const engagementId = await resolveEngagementIdFromRecord(
    "bbs_sessions",
    sessionId,
  );
  if (!engagementId) return [];

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const items = await tx
          .select()
          .from(agendaItems)
          .where(eq(agendaItems.bbsSessionId, sessionId))
          .orderBy(asc(agendaItems.sortOrder), asc(agendaItems.createdAt));
        if (items.length === 0) return [];

        const ids = items.map((i) => i.id);

        const linked = await tx
          .select({
            id: actionItems.id,
            agendaItemId: actionItems.agendaItemId,
            title: actionItems.title,
            status: actionItems.status,
            dueDate: actionItems.dueDate,
            assigneeUserProfileId: actionItems.assigneeUserProfileId,
            assigneeName: userProfiles.fullName,
          })
          .from(actionItems)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, actionItems.assigneeUserProfileId),
          )
          .where(inArray(actionItems.agendaItemId, ids))
          .orderBy(asc(actionItems.createdAt));

        const byAgendaItem = new Map<string, AgendaLinkedAction[]>();
        for (const a of linked) {
          if (!a.agendaItemId) continue;
          const list = byAgendaItem.get(a.agendaItemId) ?? [];
          list.push({
            id: a.id,
            title: a.title,
            status: a.status,
            dueDate: a.dueDate,
            assigneeUserProfileId: a.assigneeUserProfileId,
            assigneeName: a.assigneeName,
          });
          byAgendaItem.set(a.agendaItemId, list);
        }

        const raiserIds = Array.from(
          new Set(
            items
              .map((i) => i.raisedByUserProfileId)
              .filter((v): v is string => Boolean(v)),
          ),
        );
        const names = new Map<string, string>();
        if (raiserIds.length > 0) {
          const rows = await tx
            .select({ id: userProfiles.id, fullName: userProfiles.fullName })
            .from(userProfiles)
            .where(inArray(userProfiles.id, raiserIds));
          for (const r of rows) names.set(r.id, r.fullName);
        }

        return items.map((i) => ({
          ...i,
          raisedByName: i.raisedByUserProfileId
            ? (names.get(i.raisedByUserProfileId) ?? null)
            : null,
          carriedForward: Boolean(i.carriedFromAgendaItemId),
          actions: byAgendaItem.get(i.id) ?? [],
        }));
      },
    );
  } catch (e) {
    console.error("[agenda-items] read failed", e);
    return [];
  }
}
