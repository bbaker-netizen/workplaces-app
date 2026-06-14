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

import { and, desc, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { coaches, engagements, type Engagement } from "../schema";
import { withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export const SELECTED_ENGAGEMENT_COOKIE = "selected_engagement_slug";

/**
 * Set when a coach deliberately opens the client portal in "preview"
 * mode (via /portal/preview). The portal layout uses it to decide
 * whether a coach is allowed to be in the client portal at all — without
 * it, coaches are bounced straight back to their console on every portal
 * page. Cleared on return to the console (/home).
 */
export const PORTAL_PREVIEW_COOKIE = "portal_preview";

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

  // 2. Fallback: first engagement in the caller's home org (clients live
  //    here — their org holds exactly their engagement).
  const home = await withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.orgId, profile.orgId))
      .limit(1);
    return row ?? null;
  });
  if (home) return home;

  // 3. Coaches don't own engagements in their home (master) org — client
  //    engagements live in client orgs. So with nothing selected, fall
  //    back to the most recent engagement across all clients. Without
  //    this a coach previewing the portal sees "No engagement yet".
  const isCoach =
    profile.role === "master_admin" || profile.role === "coach";
  if (isCoach) {
    return withSystemContext(async (tx) => {
      const [row] = await tx
        .select()
        .from(engagements)
        .where(isNull(engagements.archivedAt))
        .orderBy(desc(engagements.createdAt))
        .limit(1);
      return row ?? null;
    });
  }
  return null;
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
      .where(
        and(
          eq(engagements.coachId, Coach.id),
          isNull(engagements.archivedAt),
        ),
      );
  });
}
