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
  withSystemContext,
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

/** Roles that sit on the client side of an engagement. */
const CLIENT_ROLES = new Set(["client_lead", "client_manager", "client_employee"]);

export type ListedAgendaItem = AgendaItem & {
  raisedByName: string | null;
  /**
   * True when a client put this on the agenda rather than a Business
   * Builder. Derived from the raiser's CURRENT role rather than stored:
   * a role change is rare, and a column here would be a second copy of a
   * fact `user_profiles` already holds. It drives a badge and nothing
   * with consequences, so the current role is the right answer.
   */
  raisedByClient: boolean;
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
    const base = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const items = await tx
          .select()
          .from(agendaItems)
          .where(eq(agendaItems.bbsSessionId, sessionId))
          .orderBy(asc(agendaItems.sortOrder), asc(agendaItems.createdAt));
        if (items.length === 0) return { items, linked: [] as LinkedRow[] };

        const ids = items.map((i) => i.id);

        const linked = await tx
          .select({
            id: actionItems.id,
            agendaItemId: actionItems.agendaItemId,
            title: actionItems.title,
            status: actionItems.status,
            dueDate: actionItems.dueDate,
            assigneeUserProfileId: actionItems.assigneeUserProfileId,
          })
          .from(actionItems)
          .where(inArray(actionItems.agendaItemId, ids))
          .orderBy(asc(actionItems.createdAt));

        return { items, linked };
      },
    );

    if (base.items.length === 0) return [];

    // People are resolved OUTSIDE the engagement binding, on purpose.
    //
    // `withEngagementContext` binds to the engagement's own org, and a
    // Business Builder's profile lives in the MASTER org — so a lookup
    // inside that binding matches none of them. On a client session that
    // silently rendered every Builder-raised point as "Raised by (nobody)"
    // and every Builder-owned commitment as "Unassigned", which reads as
    // broken data rather than as an RLS boundary doing its job. It was
    // invisible until now only because agendas were shown on the internal
    // team engagement, where everyone happens to sit in the master org.
    //
    // Not a leak: every id here came out of a row the caller was already
    // allowed to read, and all we add is a display name and a role.
    const peopleIds = Array.from(
      new Set(
        [
          ...base.items.map((i) => i.raisedByUserProfileId),
          ...base.linked.map((a) => a.assigneeUserProfileId),
        ].filter((v): v is string => Boolean(v)),
      ),
    );
    const names = new Map<string, string>();
    const roles = new Map<string, string>();
    if (peopleIds.length > 0) {
      const rows = await withSystemContext((tx) =>
        tx
          .select({
            id: userProfiles.id,
            fullName: userProfiles.fullName,
            role: userProfiles.role,
          })
          .from(userProfiles)
          .where(inArray(userProfiles.id, peopleIds)),
      );
      for (const r of rows) {
        names.set(r.id, r.fullName);
        roles.set(r.id, r.role);
      }
    }

    const byAgendaItem = new Map<string, AgendaLinkedAction[]>();
    for (const a of base.linked) {
      if (!a.agendaItemId) continue;
      const list = byAgendaItem.get(a.agendaItemId) ?? [];
      list.push({
        id: a.id,
        title: a.title,
        status: a.status,
        dueDate: a.dueDate,
        assigneeUserProfileId: a.assigneeUserProfileId,
        assigneeName: a.assigneeUserProfileId
          ? (names.get(a.assigneeUserProfileId) ?? null)
          : null,
      });
      byAgendaItem.set(a.agendaItemId, list);
    }

    return base.items.map((i) => ({
      ...i,
      raisedByName: i.raisedByUserProfileId
        ? (names.get(i.raisedByUserProfileId) ?? null)
        : null,
      raisedByClient: Boolean(
        i.raisedByUserProfileId &&
          CLIENT_ROLES.has(roles.get(i.raisedByUserProfileId) ?? ""),
      ),
      carriedForward: Boolean(i.carriedFromAgendaItemId),
      actions: byAgendaItem.get(i.id) ?? [],
    }));
  } catch (e) {
    console.error("[agenda-items] read failed", e);
    return [];
  }
}

type LinkedRow = {
  id: string;
  agendaItemId: string | null;
  title: string;
  status: string;
  dueDate: Date | null;
  assigneeUserProfileId: string | null;
};
