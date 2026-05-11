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
 *   - Cross-tenant read (`listCoachActionItems`) for the Business Builder view:
 *     items live in client orgs, the Business Builder's session is in the master
 *     org, so RLS would filter to nothing. Application layer scopes by
 *     the Business Builder's owned engagements via withSystemContext.
 */

import { eq } from "drizzle-orm";
import {
  actionItems,
  coaches,
  engagements,
  userProfiles,
  type ActionItem,
} from "../schema";
import { withEngagementContext, withSystemContext, withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

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

  // For Business Builder roles, items can live in any client org — use system context.
  if (profile.role === "master_admin" || profile.role === "coach") {
    return withSystemContext(async (tx) => {
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

  return withSystemContext(async (tx) => {
    const [coach] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.userProfileId, profile.userProfileId))
      .limit(1);
    if (!coach) return [];

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
      .where(eq(engagements.coachId, coach.id));

    return rows.map((r) => ({
      ...r.item,
      assigneeName: r.assigneeName,
      engagementId: r.engagementId,
      engagementName: r.engagementName,
      clientOrgId: r.clientOrgId,
    }));
  });
}
