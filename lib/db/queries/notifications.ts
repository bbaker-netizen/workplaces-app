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
            r.parentEntityType === "prospect_stale",
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

  // Resolve engagement names for client-acceptance notifications.
  const engagementIds = Array.from(
    new Set(
      rows
        .filter((r) => r.parentEntityType === "client_accepted")
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

  return rows.map((n) => {
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
    if (n.parentEntityType === "client_accepted") {
      const name = engNameById.get(n.parentEntityId) ?? "Your client";
      return {
        ...n,
        contextLabel: `${name} accepted their invitation — open their workspace`,
        href: `/business-builder/engagements/${n.parentEntityId}`,
      };
    }
    if (n.parentEntityType === "action_item") {
      return {
        ...n,
        contextLabel: "Action item update",
        href: `/business-builder/action-items`,
      };
    }
    return { ...n, contextLabel: null, href: null };
  });
}
