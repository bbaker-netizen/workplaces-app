/**
 * Engagements — read queries (server-side only).
 *
 * Phase 1.2 model: each user_profile belongs to one org → one engagement.
 * `getCurrentEngagement` returns it from tenant context.
 *
 * Phase 4 adds slug-based routing. When a `selected_engagement_slug`
 * cookie is set (via /portal/e/[engagementSlug]), the resolver loads
 * that engagement instead of the home one — provided the caller has
 * access. Coaches can switch context this way; clients with a single
 * engagement see the same behaviour as before.
 *
 * `listCoachEngagements` is cross-tenant (engagements live in client
 * orgs; Coach session is in master org). Uses withSystemContext.
 */

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { coaches, engagements, type Engagement } from "../schema";
import { withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export const SELECTED_ENGAGEMENT_COOKIE = "selected_engagement_slug";

export async function getCurrentEngagement(): Promise<Engagement | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  // 1. Selected-engagement cookie wins — but only if the caller can
  //    actually see that engagement.
  const slug = cookies().get(SELECTED_ENGAGEMENT_COOKIE)?.value;
  if (slug) {
    const selected = await getEngagementBySlug(slug);
    if (selected) {
      const isCoach =
        profile.role === "master_admin" || profile.role === "coach";
      if (isCoach || selected.orgId === profile.orgId) {
        return selected;
      }
    }
  }

  // 2. Fallback: first engagement in the caller's home org.
  return withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.orgId, profile.orgId))
      .limit(1);
    return row ?? null;
  });
}

/**
 * Resolve an engagement by slug. Skips RLS via system context — the
 * caller must verify access separately. Used by /portal/e/[slug] and
 * by getCurrentEngagement above.
 */
export async function getEngagementBySlug(
  slug: string,
): Promise<Engagement | null> {
  if (!slug) return null;
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.slug, slug))
      .limit(1);
    return row ?? null;
  });
}

export async function listCoachEngagements(): Promise<Engagement[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];

  return withSystemContext(async (tx) => {
    const [Coach] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.userProfileId, profile.userProfileId))
      .limit(1);
    if (!Coach) return [];

    return tx
      .select()
      .from(engagements)
      .where(eq(engagements.coachId, Coach.id));
  });
}
