/**
 * Engagements — read queries (server-side only).
 *
 * Phase 1.2 model: each user_profile belongs to one org → one engagement.
 * `getCurrentEngagement` returns it from tenant context.
 *
 * `listCoachEngagements` is cross-tenant (engagements live in client
 * orgs; coach session is in master org). Uses withSystemContext.
 */

import { eq } from "drizzle-orm";
import { coaches, engagements, type Engagement } from "../schema";
import { withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export async function getCurrentEngagement(): Promise<Engagement | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  return withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.orgId, profile.orgId))
      .limit(1);
    return row ?? null;
  });
}

export async function listCoachEngagements(): Promise<Engagement[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];

  return withSystemContext(async (tx) => {
    const [coach] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.userProfileId, profile.userProfileId))
      .limit(1);
    if (!coach) return [];

    return tx
      .select()
      .from(engagements)
      .where(eq(engagements.coachId, coach.id));
  });
}
