/**
 * First-visit user provisioning for The Builder Phase 0.
 *
 * When a Clerk-authenticated user lands on `/portal` for the first time,
 * `ensureUserProfile` looks up their `user_profiles` row by Clerk user id
 * and — if missing — bootstraps a personal org plus their profile in a
 * single transaction. Subsequent visits short-circuit on the existing
 * row.
 *
 * Phase 0 conventions (see docs/decisions.md):
 *   - One personal org per user, `clerk_org_id = clerk_user_id` as a
 *     placeholder. Real Clerk Organizations land in Phase 1.
 *   - Every new user gets `role = 'master_admin'`. Conditional / invite-
 *     based assignment is a Phase 1 concern.
 *
 * Webhook-driven provisioning replaces this in Phase 1.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { orgs, userProfiles } from "./schema";
import { withBootstrapContext, withSystemContext } from "./tenant";

export type ProvisionedProfile = {
  userProfileId: string;
  orgId: string;
  role: "master_admin";
};

export async function ensureUserProfile(
  clerkUserId: string,
  email: string,
  fullName: string,
): Promise<ProvisionedProfile> {
  // Lookup uses system context (BYPASSRLS) because we don't know the
  // tenant yet — RLS would filter to nothing without a GUC.
  const existing = await withSystemContext(async (tx) => {
    const rows = await tx
      .select({ id: userProfiles.id, orgId: userProfiles.orgId })
      .from(userProfiles)
      .where(eq(userProfiles.clerkUserId, clerkUserId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (existing) {
    return {
      userProfileId: existing.id,
      orgId: existing.orgId,
      role: "master_admin",
    };
  }

  // Pre-generate UUIDs so we can SET the GUC before INSERT.
  const newOrgId = randomUUID();
  const newUserProfileId = randomUUID();

  await withBootstrapContext(newOrgId, async (tx) => {
    await tx.insert(orgs).values({
      id: newOrgId,
      clerkOrgId: clerkUserId,
      name: email,
      type: "client",
    });
    await tx.insert(userProfiles).values({
      id: newUserProfileId,
      clerkUserId,
      orgId: newOrgId,
      email,
      fullName,
      role: "master_admin",
    });
  });

  return {
    userProfileId: newUserProfileId,
    orgId: newOrgId,
    role: "master_admin",
  };
}
