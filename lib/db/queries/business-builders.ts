/**
 * Internal-user (Business Builder) directory queries.
 *
 * "Internal users" = the people who run the practice: master admins
 * (account owners like Bruce) and standard Business Builders (coach
 * role, like Jen). They all live in the master org. Client-side roles
 * (client_lead / manager / employee / prospect) are NOT listed here.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
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
