/**
 * Phase 1.1+ user provisioning — real Clerk Organizations edition.
 *
 * The Phase 0 personal-org pattern is gone. Every user must belong to a
 * real Clerk Organization (created either by the migration script for
 * Bruce, or by the engagement-creation flow for invited client leads).
 * Sign-ups arriving without an active Clerk Org are blocked at the app
 * boundary — caller redirects to /no-invitation.
 *
 * Flow:
 *   1. Read userId + active Clerk Org id from the session.
 *   2. If either is missing, return { status: 'no_invitation' } —
 *      caller redirects.
 *   3. Look up the orgs row by clerk_org_id (system context — RLS would
 *      filter to nothing here because we have no app-side org_id GUC yet).
 *   4. Look up user_profile by clerk_user_id; return if it exists.
 *   5. First visit: read role from the active membership's
 *      publicMetadata.app_role (set by the engagement-creation
 *      invitation), provision a new user_profile in tenant context.
 *
 * Future: webhook-driven provisioning is Phase 2 backlog. For now,
 * provisioning happens lazily on first portal load.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { orgs, userProfiles } from "./schema";
import type { UserProfile } from "./schema";
import { withSystemContext, withTenantContext } from "./tenant";

type Role = UserProfile["role"];

const VALID_ROLES: ReadonlyArray<Role> = [
  "coach",
  "master_admin",
  "client_lead",
  "client_manager",
  "client_employee",
  "prospect",
];

function isValidRole(s: unknown): s is Role {
  return (
    typeof s === "string" && (VALID_ROLES as readonly string[]).includes(s)
  );
}

export type ProvisionResult =
  | { status: "no_invitation" }
  | {
      status: "ok";
      userProfileId: string;
      orgId: string;
      role: Role;
      email: string;
      fullName: string;
    };

export async function ensureUserProfile(): Promise<ProvisionResult> {
  const { userId, orgId: clerkOrgId } = await auth();

  // Middleware blocks unauthenticated requests, but handle defensively.
  if (!userId) return { status: "no_invitation" };

  // No active Clerk Org → user has no membership → blocked.
  if (!clerkOrgId) return { status: "no_invitation" };

  // Find our app's orgs row for this Clerk Org. System context: RLS
  // can't bind here because we don't have an app org_id to set as GUC.
  const orgRow = await withSystemContext(async (tx) => {
    const rows = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.clerkOrgId, clerkOrgId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!orgRow) {
    // The user's active Clerk Org has no corresponding app-side row.
    // Shouldn't happen with the normal flow (engagement creation creates
    // both atomically). If it does, the engagement-creation transaction
    // probably failed mid-way. Don't auto-recover — surface so we
    // investigate.
    throw new Error(
      `Clerk Org ${clerkOrgId} has no row in The Builder's orgs table. ` +
        `This typically means an engagement-creation transaction failed ` +
        `between Clerk Org creation and the orgs INSERT. Investigate and ` +
        `either complete the migration or revoke the orphaned Clerk Org.`,
    );
  }

  // Existing user_profile? Look up by clerk_user_id.
  const existing = await withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        id: userProfiles.id,
        role: userProfiles.role,
        orgId: userProfiles.orgId,
        email: userProfiles.email,
        fullName: userProfiles.fullName,
      })
      .from(userProfiles)
      .where(eq(userProfiles.clerkUserId, userId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (existing) {
    return {
      status: "ok",
      userProfileId: existing.id,
      orgId: existing.orgId,
      role: existing.role,
      email: existing.email,
      fullName: existing.fullName,
    };
  }

  // First visit. Pull the user's display fields and the membership's
  // app_role from Clerk.
  const user = await currentUser();
  if (!user) return { status: "no_invitation" };

  const email = user.primaryEmailAddress?.emailAddress ?? "(no email)";
  const fullName =
    user.fullName ?? user.firstName ?? user.username ?? email;

  const clerk = await clerkClient();
  const memberships = await clerk.users.getOrganizationMembershipList({
    userId,
  });
  const activeMembership = memberships.data.find(
    (m) => m.organization.id === clerkOrgId,
  );
  const inviteRole = (
    activeMembership?.publicMetadata as Record<string, unknown> | undefined
  )?.app_role;
  const role: Role = isValidRole(inviteRole) ? inviteRole : "client_employee";

  if (!isValidRole(inviteRole)) {
    console.warn(
      `User ${userId} provisioned without app_role in Clerk membership ` +
        `publicMetadata for org ${clerkOrgId}. Defaulting to 'client_employee'. ` +
        `If this is unexpected, check the engagement-creation invitation flow.`,
    );
  }

  // Provision in tenant context. WITH CHECK (org_id = auth.org_id())
  // requires the GUC to match the new row's org_id, so the GUC is
  // orgRow.id (the user's app-side org).
  const newUserProfileId = randomUUID();
  await withTenantContext(orgRow.id, async (tx) => {
    await tx.insert(userProfiles).values({
      id: newUserProfileId,
      clerkUserId: userId,
      orgId: orgRow.id,
      email,
      fullName,
      role,
    });
  });

  return {
    status: "ok",
    userProfileId: newUserProfileId,
    orgId: orgRow.id,
    role,
    email,
    fullName,
  };
}
