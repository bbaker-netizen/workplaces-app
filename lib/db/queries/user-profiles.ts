/**
 * User profiles — read queries (server-side only).
 *
 * `listEngagementMembers` powers the assignee picker on the new action
 * item form. Two modes:
 *   - Coach (master_admin / Coach): cross-tenant read via system context
 *     (we may need members of any client engagement).
 *   - Client roles: tenant-scoped — RLS already scopes to their own org.
 */

import { and, eq, or } from "drizzle-orm";
import { engagements, orgs, userProfiles, type UserProfile } from "../schema";
import { withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

/**
 * Every Business Builder (master_admin / coach) in the master org. They
 * can lead projects, own action items, and be @mentioned on any
 * engagement — Bruce or Jen — but their profiles live in the master org,
 * invisible to client-org RLS, so we resolve them via system context.
 */
async function getBusinessBuilderProfiles(): Promise<UserProfile[]> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];
    return tx
      .select()
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, master.id),
          or(
            eq(userProfiles.role, "master_admin"),
            eq(userProfiles.role, "coach"),
          ),
        ),
      );
  });
}

export type BusinessBuilderOption = {
  id: string;
  fullName: string;
};

/**
 * The Business Builders who can own a prospect/client — every
 * master_admin / coach in the master org. Used by the owner picker on the
 * prospect detail page. Coach-gated; returns [] for client roles.
 */
export async function listBusinessBuilders(): Promise<BusinessBuilderOption[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];
    const rows = await tx
      .select({ id: userProfiles.id, fullName: userProfiles.fullName })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, master.id),
          or(
            eq(userProfiles.role, "master_admin"),
            eq(userProfiles.role, "coach"),
          ),
        ),
      );
    return rows
      .map((r) => ({ id: r.id, fullName: r.fullName ?? "(unnamed)" }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });
}

export async function listEngagementMembers(
  engagementId: string,
): Promise<UserProfile[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  const members =
    profile.role === "master_admin" || profile.role === "coach"
      ? await withSystemContext(async (tx) => {
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
        })
      : // Client roles: scoped to their own org via RLS.
        await withTenantContext(profile.orgId, async (tx) => {
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

  // Always include the Business Builders (Bruce, Jen). They sit in the
  // master org, so the client-org reads above never pick them up — which
  // is why the project Lead picker showed only "Unassigned" even though a
  // Business Builder runs the engagement. They go first so they head the
  // assignable list.
  const builders = await getBusinessBuilderProfiles();
  const seen = new Set(members.map((m) => m.id));
  const buildersToAdd = builders.filter((b) => !seen.has(b.id));
  return [...buildersToAdd, ...members];
}
