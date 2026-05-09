/**
 * Goals — read queries (server-side only).
 */

import { eq } from "drizzle-orm";
import { goals, userProfiles, type Goal } from "../schema";
import { withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ListedGoal = Goal & {
  ownerName: string | null;
};

export async function listEngagementGoals(
  engagementId: string,
): Promise<ListedGoal[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  return withTenantContext(profile.orgId, async (tx) => {
    const rows = await tx
      .select({
        goal: goals,
        ownerName: userProfiles.fullName,
      })
      .from(goals)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, goals.ownerUserProfileId),
      )
      .where(eq(goals.engagementId, engagementId));
    return rows.map((r) => ({ ...r.goal, ownerName: r.ownerName }));
  });
}

export async function getGoal(id: string): Promise<ListedGoal | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  return withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .select({ goal: goals, ownerName: userProfiles.fullName })
      .from(goals)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, goals.ownerUserProfileId),
      )
      .where(eq(goals.id, id))
      .limit(1);
    if (!row) return null;
    return { ...row.goal, ownerName: row.ownerName };
  });
}
