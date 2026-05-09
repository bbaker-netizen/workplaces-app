/**
 * Goals — read queries (server-side only).
 */

import { eq } from "drizzle-orm";
import { goals, userProfiles, type Goal } from "../schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ListedGoal = Goal & {
  ownerName: string | null;
};

export async function listEngagementGoals(
  engagementId: string,
): Promise<ListedGoal[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
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
      },
    );
  } catch {
    return [];
  }
}

export async function getGoal(id: string): Promise<ListedGoal | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await resolveEngagementIdFromRecord("goals", id);
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
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
      },
    );
  } catch {
    return null;
  }
}
