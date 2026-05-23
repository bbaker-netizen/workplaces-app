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

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { notifications, type Notification } from "../schema";
import { withTenantContext } from "../tenant";
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
