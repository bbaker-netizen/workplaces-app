/**
 * Internal-user (Business Builder) directory queries.
 *
 * "Internal users" = the people who run the practice: master admins
 * (account owners like Bruce) and standard Business Builders (coach
 * role, like Jen). They all live in the master org. Client-side roles
 * (client_lead / manager / employee / prospect) are NOT listed here.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { orgs, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type InternalUser = {
  id: string;
  clerkUserId: string;
  fullName: string;
  email: string;
  role: "master_admin" | "coach";
};

/**
 * List every internal user in the master org, master admins first then
 * standard Business Builders, each alphabetical by name.
 */
export async function listInternalUsers(): Promise<InternalUser[]> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];

    const rows = await tx
      .select({
        id: userProfiles.id,
        clerkUserId: userProfiles.clerkUserId,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, master.id),
          inArray(userProfiles.role, ["master_admin", "coach"]),
        ),
      )
      .orderBy(asc(userProfiles.fullName));

    // master_admin sorts before coach; name is the tiebreak (already
    // applied by the SQL order-by).
    return rows
      .map((r) => ({
        id: r.id,
        clerkUserId: r.clerkUserId,
        fullName: r.fullName,
        email: r.email,
        role: r.role as "master_admin" | "coach",
      }))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "master_admin" ? -1 : 1;
        return a.fullName.localeCompare(b.fullName);
      });
  });
}

export type PendingInvite = {
  id: string;
  email: string;
  fullName: string | null;
  role: "master_admin" | "coach";
  createdAt: number;
};

/**
 * Outstanding Clerk invitations to the master org that haven't been
 * accepted yet — i.e. Business Builders you've invited who haven't signed
 * up. Distinct from listInternalUsers (those have already joined). Returns
 * [] on any error so the team page never breaks over it.
 */
export async function listPendingBusinessBuilderInvites(): Promise<
  PendingInvite[]
> {
  const clerkOrgId = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ clerkOrgId: orgs.clerkOrgId })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return master?.clerkOrgId ?? null;
  });
  if (!clerkOrgId) return [];

  try {
    const clerk = await clerkClient();
    const res = await clerk.organizations.getOrganizationInvitationList({
      organizationId: clerkOrgId,
      status: ["pending"],
    });
    return res.data.map((inv) => {
      const meta = (inv.publicMetadata ?? {}) as Record<string, unknown>;
      const appRole = meta.app_role === "master_admin" ? "master_admin" : "coach";
      const fullName =
        typeof meta.invited_full_name === "string"
          ? meta.invited_full_name
          : null;
      return {
        id: inv.id,
        email: inv.emailAddress,
        fullName,
        role: appRole as "master_admin" | "coach",
        createdAt: inv.createdAt,
      };
    });
  } catch (e) {
    console.error("[business-builders] listPendingInvites failed", e);
    return [];
  }
}
