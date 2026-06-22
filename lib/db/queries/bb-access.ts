/**
 * Business Builder access control — read helpers.
 *
 * A master_admin can limit other Business Builders (role `coach`) to
 * specific clients and specific console modules. Defaults preserve the
 * prior behaviour: every Business Builder keeps `all_clients_access=true`
 * and `allowed_console_modules=null` (all) until a master_admin changes
 * it. master_admin ALWAYS has full access and bypasses every check.
 *
 * Grants live in `bb_client_access`; cross-org by nature (the Business
 * Builder is in the master org, the engagement in a client org), so reads
 * run in `withSystemContext`.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { bbClientAccess, engagements, userProfiles } from "../schema";
import { withSystemContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type BbAccess = {
  /** True for master_admin — full access, bypasses every restriction. */
  isMasterAdmin: boolean;
  /** True for any Business Builder (master_admin or coach). */
  isBusinessBuilder: boolean;
  /** When false, the Business Builder is limited to `grantedEngagementIds`. */
  allClientsAccess: boolean;
  /** Console nav hrefs this user may use; null = all of them. */
  allowedConsoleModules: string[] | null;
  /** Explicitly-granted engagement ids (only meaningful when
   *  `allClientsAccess` is false). */
  grantedEngagementIds: string[];
};

const FULL_ACCESS: BbAccess = {
  isMasterAdmin: true,
  isBusinessBuilder: true,
  allClientsAccess: true,
  allowedConsoleModules: null,
  grantedEngagementIds: [],
};

/**
 * Resolve the current signed-in user's Business Builder access. Returns
 * full access for master_admin, and a "not a Business Builder" shape for
 * client roles (callers should not use it for client gating).
 */
export async function getCurrentBbAccess(): Promise<BbAccess> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ...FULL_ACCESS, isMasterAdmin: false, isBusinessBuilder: false };
  }
  if (profile.role === "master_admin") return FULL_ACCESS;
  if (profile.role !== "coach") {
    return { ...FULL_ACCESS, isMasterAdmin: false, isBusinessBuilder: false };
  }

  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        allClientsAccess: userProfiles.allClientsAccess,
        allowedConsoleModules: userProfiles.allowedConsoleModules,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, profile.userProfileId))
      .limit(1);

    const allClientsAccess = row?.allClientsAccess ?? true;
    const allowedConsoleModules =
      (row?.allowedConsoleModules as string[] | null) ?? null;

    const grantedEngagementIds = allClientsAccess
      ? []
      : (
          await tx
            .select({ engagementId: bbClientAccess.engagementId })
            .from(bbClientAccess)
            .where(eq(bbClientAccess.coachUserProfileId, profile.userProfileId))
        ).map((g) => g.engagementId);

    return {
      isMasterAdmin: false,
      isBusinessBuilder: true,
      allClientsAccess,
      allowedConsoleModules,
      grantedEngagementIds,
    };
  });
}

/**
 * Can the current Business Builder access this specific engagement?
 * master_admin and all-clients Business Builders: always yes. Restricted
 * ones: only when explicitly granted.
 */
export async function canCurrentBbAccessEngagement(
  engagementId: string,
): Promise<boolean> {
  const access = await getCurrentBbAccess();
  if (!access.isBusinessBuilder) return false;
  if (access.isMasterAdmin || access.allClientsAccess) return true;
  return access.grantedEngagementIds.includes(engagementId);
}

export type BbUserAdminRow = {
  userProfileId: string;
  fullName: string;
  email: string;
  role: string;
  allClientsAccess: boolean;
  allowedConsoleModules: string[] | null;
  grantedEngagementIds: string[];
};

/**
 * For the master_admin "Team access" admin page: every Business Builder in
 * the master org with their current access settings, plus the list of
 * active clients to grant from. Returns null for non-master_admin callers.
 */
export async function listBusinessBuildersForAdmin(): Promise<{
  users: BbUserAdminRow[];
  clients: { id: string; name: string }[];
} | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok" || profile.role !== "master_admin") return null;
  const masterOrgId = profile.orgId;

  return withSystemContext(async (tx) => {
    const users = await tx
      .select({
        userProfileId: userProfiles.id,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
        role: userProfiles.role,
        allClientsAccess: userProfiles.allClientsAccess,
        allowedConsoleModules: userProfiles.allowedConsoleModules,
      })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, masterOrgId),
          inArray(userProfiles.role, ["master_admin", "coach"]),
        ),
      );

    const grants = await tx
      .select({
        coachUserProfileId: bbClientAccess.coachUserProfileId,
        engagementId: bbClientAccess.engagementId,
      })
      .from(bbClientAccess)
      .where(eq(bbClientAccess.orgId, masterOrgId));

    const byCoach = new Map<string, string[]>();
    for (const g of grants) {
      const list = byCoach.get(g.coachUserProfileId) ?? [];
      list.push(g.engagementId);
      byCoach.set(g.coachUserProfileId, list);
    }

    const clients = (
      await tx
        .select({ id: engagements.id, name: engagements.name })
        .from(engagements)
        .where(isNull(engagements.archivedAt))
    )
      .map((c) => ({ id: c.id, name: c.name ?? "Untitled client" }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );

    return {
      users: users.map((u) => ({
        userProfileId: u.userProfileId,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        allClientsAccess: u.allClientsAccess,
        allowedConsoleModules:
          (u.allowedConsoleModules as string[] | null) ?? null,
        grantedEngagementIds: byCoach.get(u.userProfileId) ?? [],
      })),
      clients,
    };
  });
}
