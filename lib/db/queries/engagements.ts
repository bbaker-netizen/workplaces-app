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

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { coaches, engagements, type Engagement } from "../schema";
import { withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";
import {
  canCurrentBbAccessEngagement,
  getCurrentBbAccess,
} from "./bb-access";

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
  //    actually see that engagement. The cookie holds the engagement's
  //    UUID (collision-proof); older cookies may hold a slug, so we
  //    resolve either via getEngagementByIdOrSlug.
  const selectedKey = cookies().get(SELECTED_ENGAGEMENT_COOKIE)?.value;
  if (selectedKey) {
    const selected = await getEngagementByIdOrSlug(selectedKey);
    if (selected) {
      const isCoach =
        profile.role === "master_admin" || profile.role === "coach";
      if (isCoach) {
        // Business Builders can preview any client they're allowed to
        // reach. Restricted Builders are denied ungranted clients even by
        // direct URL — fall through to their default below.
        if (await canCurrentBbAccessEngagement(selected.id)) return selected;
      } else if (selected.orgId === profile.orgId) {
        return selected;
      }
    }
  }

  const isCoach =
    profile.role === "master_admin" || profile.role === "coach";

  // 2. Fallback for CLIENTS: their home org holds exactly their
  //    engagement. (Skip for coaches — the master org holds many
  //    engagements, so an org-scoped pick would return an arbitrary
  //    client. That was a cross-client bug.) Order deterministically.
  if (!isCoach) {
    const home = await withTenantContext(profile.orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(engagements)
        .where(eq(engagements.orgId, profile.orgId))
        .orderBy(desc(engagements.createdAt))
        .limit(1);
      return row ?? null;
    });
    if (home) return home;
  }

  // 3. Coaches don't own engagements in their home (master) org — client
  //    engagements live in client orgs. So with nothing selected, fall
  //    back to the most recent engagement across all clients. Without
  //    this a coach previewing the portal sees "No engagement yet".
  //    A restricted Business Builder falls back only within their grants.
  if (isCoach) {
    const access = await getCurrentBbAccess();
    const restricted =
      !access.isMasterAdmin && !access.allClientsAccess;
    if (restricted && access.grantedEngagementIds.length === 0) return null;
    return withSystemContext(async (tx) => {
      const [row] = await tx
        .select()
        .from(engagements)
        .where(
          restricted
            ? and(
                isNull(engagements.archivedAt),
                inArray(engagements.id, access.grantedEngagementIds),
              )
            : isNull(engagements.archivedAt),
        )
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
    // Order deterministically so a (theoretical) slug collision always
    // resolves to the same engagement rather than an arbitrary row.
    const [row] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.slug, slug))
      .orderBy(desc(engagements.createdAt))
      .limit(1);
    return row ?? null;
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an engagement by its UUID id OR slug. Prefer the id (the
 * primary key — always unique). This is the collision-proof entry point
 * for preview selection: slugs can be duplicated or wrong, ids cannot.
 * Skips RLS via system context; the caller verifies access separately.
 */
export async function getEngagementByIdOrSlug(
  value: string,
): Promise<Engagement | null> {
  if (!value) return null;
  if (UUID_RE.test(value)) {
    return withSystemContext(async (tx) => {
      const [row] = await tx
        .select()
        .from(engagements)
        .where(eq(engagements.id, value))
        .limit(1);
      return row ?? null;
    });
  }
  return getEngagementBySlug(value);
}

export async function listCoachEngagements(): Promise<Engagement[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];

  const access = await getCurrentBbAccess();

  return withSystemContext(async (tx) => {
    let rows: Engagement[];

    if (access.isMasterAdmin) {
      // master_admin sees every active client, regardless of coach.
      rows = await tx
        .select()
        .from(engagements)
        .where(isNull(engagements.archivedAt));
    } else if (!access.allClientsAccess) {
      // Restricted Business Builder: only explicitly-granted clients.
      if (access.grantedEngagementIds.length === 0) return [];
      rows = await tx
        .select()
        .from(engagements)
        .where(
          and(
            inArray(engagements.id, access.grantedEngagementIds),
            isNull(engagements.archivedAt),
          ),
        );
    } else {
      // Default Business Builder: clients they're the assigned coach on
      // (unchanged from the prior behaviour).
      const [Coach] = await tx
        .select({ id: coaches.id })
        .from(coaches)
        .where(eq(coaches.userProfileId, profile.userProfileId))
        .limit(1);
      if (!Coach) return [];
      rows = await tx
        .select()
        .from(engagements)
        .where(
          and(
            eq(engagements.coachId, Coach.id),
            isNull(engagements.archivedAt),
          ),
        );
    }

    // Alphabetical by client name (case-insensitive) so the switcher and
    // any list reads A→Z.
    return rows.sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, {
        sensitivity: "base",
      }),
    );
  });
}
