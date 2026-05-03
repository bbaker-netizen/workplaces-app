/**
 * User profiles — read queries (server-side only).
 *
 * `listEngagementMembers` powers the assignee picker on the new action
 * item form. Two modes:
 *   - Coach (master_admin / coach): cross-tenant read via system context
 *     (we may need members of any client engagement).
 *   - Client roles: tenant-scoped — RLS already scopes to their own org.
 */

import { eq } from "drizzle-orm";
import { engagements, userProfiles, type UserProfile } from "../schema";
import { withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export async function listEngagementMembers(
  engagementId: string,
): Promise<UserProfile[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  if (profile.role === "master_admin" || profile.role === "coach") {
    return withSystemContext(async (tx) => {
      const [eng] = await tx
        .select({ orgId: engagements.orgId })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      if (!eng) return [];
      return tx
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.orgId, eng.orgId));
    });
  }

  // Client roles: scoped to their own org via RLS.
  return withTenantContext(profile.orgId, async (tx) => {
    const [eng] = await tx
      .select({ orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!eng || eng.orgId !== profile.orgId) return [];
    return tx
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.orgId, profile.orgId));
  });
}
