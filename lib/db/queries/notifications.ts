/**
 * Notifications — read queries (server-side).
 *
 * Phase 1.2 surface: in-app only (sent_via='in_app'). Email triggers
 * land in 1.4 with Resend. Tenant-scoped — `notifications.org_id`
 * matches the user's home org for events local to that org.
 *
 * Cross-org Coach aggregation (Bruce mentioned in a client engagement
 * while signed in to master) is a Phase 1.7+ concern; for now Bruce's
 * notifications are scoped to whichever org his session is active in.
 */

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  actionItems,
  bbsSessions,
  engagements,
  notifications,
  prospects,
  type Notification,
} from "../schema";
import { withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export async function getUnreadNotificationCount(): Promise<number> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return 0;

  return withTenantContext(profile.orgId, async (tx) => {
    const rows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userProfileId, profile.userProfileId),
          isNull(notifications.readAt),
          // Exclude notifications whose prospect has since been deleted.
          // The feed hides these (see listBusinessBuilderNotifications);
          // without the same rule here the bell badge would claim unread
          // items that aren't in the list, which reads as a broken badge.
          sql`(
            ${notifications.parentEntityType} NOT IN (
              'prospect_comment','prospect_stale','prospect_new_lead',
              'prospect_assigned','prospect_followup_due'
            )
            OR EXISTS (
              SELECT 1 FROM prospects p WHERE p.id = ${notifications.parentEntityId}
            )
          )`,
        ),
      );
    return rows[0]?.count ?? 0;
  });
}

export async function listNotifications(): Promise<Notification[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  return withTenantContext(profile.orgId, async (tx) => {
    return tx
      .select()
      .from(notifications)
      .where(eq(notifications.userProfileId, profile.userProfileId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  });
}

export type BusinessBuilderNotification = Notification & {
  /** Human label for the notification, e.g. the prospect it's about. */
  contextLabel: string | null;
  /** Where clicking the notification should go, or null if not linkable. */
  href: string | null;
};

/**
 * Notifications for a Business Builder, enriched with the context label +
 * deep link for each kind. Currently resolves prospect names for the
 * internal team-discussion (`prospect_comment`) notifications; other
 * types fall back to a generic label + link.
 */
export async function listBusinessBuilderNotifications(): Promise<
  BusinessBuilderNotification[]
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];

  const rows = await withTenantContext(profile.orgId, async (tx) =>
    tx
      .select()
      .from(notifications)
      .where(eq(notifications.userProfileId, profile.userProfileId))
      .orderBy(desc(notifications.createdAt))
      .limit(50),
  );

  // Resolve prospect names for any prospect-scoped notifications in one
  // batched read.
  const prospectIds = Array.from(
    new Set(
      rows
        .filter(
          (r) =>
            r.parentEntityType === "prospect_comment" ||
            r.parentEntityType === "prospect_stale" ||
            r.parentEntityType === "prospect_new_lead" ||
            r.parentEntityType === "prospect_assigned" ||
            r.parentEntityType === "prospect_followup_due",
        )
        .map((r) => r.parentEntityId),
    ),
  );
  const nameById = new Map<string, string>();
  if (prospectIds.length > 0) {
    const pRows = await withSystemContext((tx) =>
      tx
        .select({ id: prospects.id, companyName: prospects.companyName })
        .from(prospects)
        .where(inArray(prospects.id, prospectIds)),
    );
    for (const p of pRows) nameById.set(p.id, p.companyName);
  }

  // Action item titles, so the bell says WHICH commitment moved rather
  // than "Action item update". One batched read, same shape as the
  // prospect and engagement lookups above.
  const actionItemIds = Array.from(
    new Set(
      rows
        .filter((r) => r.parentEntityType === "action_item")
        .map((r) => r.parentEntityId),
    ),
  );
  const actionItemTitleById = new Map<string, string>();
  if (actionItemIds.length > 0) {
    const aRows = await withSystemContext((tx) =>
      tx
        .select({ id: actionItems.id, title: actionItems.title })
        .from(actionItems)
        .where(inArray(actionItems.id, actionItemIds)),
    );
    for (const a of aRows) actionItemTitleById.set(a.id, a.title);
  }

  // Resolve engagement names for the notifications keyed by engagement:
  // client acceptance, and a client posting in Communication.
  const engagementIds = Array.from(
    new Set(
      rows
        .filter(
          (r) =>
            r.parentEntityType === "client_accepted" ||
            r.parentEntityType === "client_message",
        )
        .map((r) => r.parentEntityId),
    ),
  );
  const engNameById = new Map<string, string>();
  if (engagementIds.length > 0) {
    const eRows = await withSystemContext((tx) =>
      tx
        .select({ id: engagements.id, name: engagements.name })
        .from(engagements)
        .where(inArray(engagements.id, engagementIds)),
    );
    for (const e of eRows) engNameById.set(e.id, e.name ?? "your client");
  }

  // Client-raised agenda points: resolve the session's engagement so the
  // deep link can be built with both segments, and its name so the feed
  // says WHICH client wants to cover something.
  // All three agenda notice kinds put a SESSION id in `parentEntityId`
  // and need the same resolution, so they share one batched lookup.
  const AGENDA_PARENT_TYPES = new Set([
    "agenda_item_raised",
    "agenda_finalized",
    "agenda_updated",
  ]);
  const agendaSessionIds = Array.from(
    new Set(
      rows
        .filter((r) => AGENDA_PARENT_TYPES.has(r.parentEntityType))
        .map((r) => r.parentEntityId),
    ),
  );
  const agendaSessionById = new Map<
    string,
    { engagementId: string; engagementName: string; isInternal: boolean }
  >();
  if (agendaSessionIds.length > 0) {
    const sRows = await withSystemContext((tx) =>
      tx
        .select({
          id: bbsSessions.id,
          engagementId: bbsSessions.engagementId,
          engagementName: engagements.name,
          isInternal: engagements.isInternal,
        })
        .from(bbsSessions)
        .innerJoin(engagements, eq(engagements.id, bbsSessions.engagementId))
        .where(inArray(bbsSessions.id, agendaSessionIds)),
    );
    for (const s of sRows) {
      agendaSessionById.set(s.id, {
        engagementId: s.engagementId,
        engagementName: s.engagementName?.trim() || "A client",
        isInternal: Boolean(s.isInternal),
      });
    }
  }

  /** The internal touch-base lives under /team, every client session
   *  under its engagement. Same rule as lib/notifications/agenda-finalized.ts. */
  const agendaHref = (
    s: { engagementId: string; isInternal: boolean },
    sessionId: string,
  ) =>
    s.isInternal
      ? `/business-builder/team/${sessionId}`
      : `/business-builder/sessions/${s.engagementId}/${sessionId}`;

  // `notifications.parent_entity_id` carries no foreign key, so deleting
  // a prospect leaves its notifications behind. They used to render as
  // "Follow-up due: a lead" pointing at a dead link. Drop them instead —
  // a notification about a record that no longer exists is noise the
  // reader can't act on.
  const PROSPECT_SCOPED = new Set([
    "prospect_comment",
    "prospect_stale",
    "prospect_new_lead",
    "prospect_assigned",
    "prospect_followup_due",
  ]);
  const live = rows.filter(
    (n) => !PROSPECT_SCOPED.has(n.parentEntityType) || nameById.has(n.parentEntityId),
  );

  return live.map((n) => {
    if (n.parentEntityType === "prospect_comment") {
      const name = nameById.get(n.parentEntityId) ?? "a lead";
      return {
        ...n,
        contextLabel: `New comment on ${name}`,
        href: `/business-builder/pipeline/${n.parentEntityId}`,
      };
    }
    if (n.parentEntityType === "prospect_stale") {
      const name = nameById.get(n.parentEntityId) ?? "a lead";
      return {
        ...n,
        contextLabel: `${name} has gone quiet — follow up or move it to Lost`,
        href: `/business-builder/pipeline/${n.parentEntityId}`,
      };
    }
    if (n.parentEntityType === "prospect_new_lead") {
      const name = nameById.get(n.parentEntityId) ?? "A new lead";
      return {
        ...n,
        contextLabel: `New lead: ${name} — strike while warm`,
        href: `/business-builder/pipeline/${n.parentEntityId}`,
      };
    }
    if (n.parentEntityType === "prospect_assigned") {
      const name = nameById.get(n.parentEntityId) ?? "A lead";
      return {
        ...n,
        contextLabel: `${name} was assigned to you`,
        href: `/business-builder/pipeline/${n.parentEntityId}`,
      };
    }
    if (n.parentEntityType === "prospect_followup_due") {
      const name = nameById.get(n.parentEntityId) ?? "a lead";
      return {
        ...n,
        contextLabel: `Follow-up due: ${name}`,
        href: `/business-builder/pipeline/${n.parentEntityId}`,
      };
    }
    if (n.parentEntityType === "client_accepted") {
      const name = engNameById.get(n.parentEntityId) ?? "Your client";
      return {
        ...n,
        contextLabel: `${name} accepted their invitation — open their workspace`,
        href: `/business-builder/engagements/${n.parentEntityId}`,
      };
    }
    if (n.parentEntityType === "action_item") {
      // Deep-link to the item, not the list. "Action item update" over a
      // link to 200 items is a notification that makes you go and find
      // the thing it is about — the same vagueness that made the recap
      // approval links useless before they were pointed at a real page.
      const title = actionItemTitleById.get(n.parentEntityId);
      const href = `/business-builder/action-items/${n.parentEntityId}`;
      if (n.type === "action_item_progress") {
        return {
          ...n,
          contextLabel: title
            ? `A client moved: ${title}`
            : "A client moved one of their commitments",
          href,
        };
      }
      return {
        ...n,
        contextLabel: title ? `Action item: ${title}` : "Action item update",
        href,
      };
    }
    if (n.parentEntityType === "client_message") {
      const name = engNameById.get(n.parentEntityId) ?? "A client";
      return {
        ...n,
        contextLabel: `${name} sent you a message`,
        href: `/business-builder/communication/${n.parentEntityId}`,
      };
    }
    if (n.parentEntityType === "agenda_item_raised") {
      // `parentEntityId` is the SESSION id. The session page needs BOTH
      // the engagement and the session in its path, so the engagement is
      // resolved above rather than guessed — a one-segment guess is
      // exactly how the recap approval links 404'd on 2026-08-03.
      const s = agendaSessionById.get(n.parentEntityId);
      if (!s) return { ...n, contextLabel: null, href: null };
      return {
        ...n,
        contextLabel: `${s.engagementName} added a point to their agenda`,
        href: agendaHref(s, n.parentEntityId),
      };
    }
    if (
      n.parentEntityType === "agenda_finalized" ||
      n.parentEntityType === "agenda_updated"
    ) {
      const s = agendaSessionById.get(n.parentEntityId);
      if (!s) return { ...n, contextLabel: null, href: null };
      const label = s.isInternal ? "the team touch-base" : s.engagementName;
      return {
        ...n,
        contextLabel:
          n.parentEntityType === "agenda_updated"
            ? `The agenda for ${label} changed — check before the session`
            : `The agenda for ${label} is set — add anything you need covered`,
        href: agendaHref(s, n.parentEntityId),
      };
    }
    return { ...n, contextLabel: null, href: null };
  });
}
