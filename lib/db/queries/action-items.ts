/**
 * Action Items — read queries (server-side only).
 *
 * Mutations live in `lib/actions/action-items.ts`. These functions are
 * called from server components and pages, never from client components.
 *
 * Two visibility modes:
 *   - Tenant-scoped reads (`listEngagementActionItems`) for the client
 *     portal: the user's active Clerk Org → app org_id → RLS scopes to
 *     just their engagement's items.
 *   - Cross-tenant read (`listCoachActionItems`) for the Coach view:
 *     items live in client orgs, the Coach's session is in the master
 *     org, so RLS would filter to nothing. Application layer scopes by
 *     the Coach's owned engagements via withSystemContext.
 */

import { eq } from "drizzle-orm";
import {
  actionItems,
  engagements,
  userProfiles,
  type ActionItem,
} from "../schema";
import { withEngagementContext, withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";
import { canCurrentBbAccessEngagement } from "./bb-access";
import { coachScopeWhere } from "./business-builder-cross-engagement";

export type ListedActionItem = ActionItem & {
  assigneeName: string | null;
};

export type CoachListedActionItem = ListedActionItem & {
  engagementId: string;
  engagementName: string | null;
  clientOrgId: string;
};

export async function listEngagementActionItems(
  engagementId: string,
): Promise<ListedActionItem[]> {
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
            item: actionItems,
            assigneeName: userProfiles.fullName,
          })
          .from(actionItems)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, actionItems.assigneeUserProfileId),
          )
          .where(eq(actionItems.engagementId, engagementId));

        return rows.map((r) => ({
          ...r.item,
          assigneeName: r.assigneeName,
        }));
      },
    );
  } catch {
    return [];
  }
}

export async function getActionItem(
  id: string,
): Promise<ListedActionItem | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  // For Coach roles, items can live in any client org — use system context.
  if (profile.role === "master_admin" || profile.role === "coach") {
    const found = await withSystemContext(async (tx) => {
      const rows = await tx
        .select({
          item: actionItems,
          assigneeName: userProfiles.fullName,
        })
        .from(actionItems)
        .leftJoin(
          userProfiles,
          eq(userProfiles.id, actionItems.assigneeUserProfileId),
        )
        .where(eq(actionItems.id, id))
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0].item, assigneeName: rows[0].assigneeName };
    });
    if (!found) return null;
    // A coach restricted to specific clients may only read items for
    // engagements they were granted (master_admin / all-clients pass).
    if (
      found.engagementId &&
      !(await canCurrentBbAccessEngagement(found.engagementId))
    ) {
      return null;
    }
    return found;
  }

  // Client roles: tenant-scoped lookup via RLS.
  return withTenantContext(profile.orgId, async (tx) => {
    const rows = await tx
      .select({
        item: actionItems,
        assigneeName: userProfiles.fullName,
      })
      .from(actionItems)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, actionItems.assigneeUserProfileId),
      )
      .where(eq(actionItems.id, id))
      .limit(1);
    if (!rows[0]) return null;
    return { ...rows[0].item, assigneeName: rows[0].assigneeName };
  });
}

export async function listCoachActionItems(): Promise<
  CoachListedActionItem[]
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];

  // Same scope as the other coach cross-client views: standard BB → their own
  // clients; master admin → all, or just theirs when the "mine" toggle is on.
  const where = await coachScopeWhere(profile);
  if (where === false) return [];

  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        item: actionItems,
        engagementName: engagements.name,
        engagementId: engagements.id,
        clientOrgId: engagements.orgId,
        assigneeName: userProfiles.fullName,
      })
      .from(actionItems)
      .innerJoin(engagements, eq(engagements.id, actionItems.engagementId))
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, actionItems.assigneeUserProfileId),
      )
      .where(where);

    return rows.map((r) => ({
      ...r.item,
      assigneeName: r.assigneeName,
      engagementId: r.engagementId,
      engagementName: r.engagementName,
      clientOrgId: r.clientOrgId,
    }));
  });
}
