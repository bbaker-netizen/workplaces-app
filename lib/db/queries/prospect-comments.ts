/**
 * Internal Business Builder comments on a prospect — read queries.
 *
 * Comments live in the master org (like the prospect itself). Reads run
 * in system context because the Business Builder side always operates
 * against the master org's records, and the caller is already role-gated
 * to master_admin / coach before we get here.
 */

import { asc, eq } from "drizzle-orm";
import { prospectComments, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type ProspectCommentWithAuthor = {
  id: string;
  prospectId: string;
  body: string;
  authorUserProfileId: string | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Oldest-first so the thread reads top-to-bottom like a conversation. */
export async function listProspectComments(
  prospectId: string,
): Promise<ProspectCommentWithAuthor[]> {
  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        id: prospectComments.id,
        prospectId: prospectComments.prospectId,
        body: prospectComments.body,
        authorUserProfileId: prospectComments.authorUserProfileId,
        authorName: userProfiles.fullName,
        createdAt: prospectComments.createdAt,
        updatedAt: prospectComments.updatedAt,
      })
      .from(prospectComments)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, prospectComments.authorUserProfileId),
      )
      .where(eq(prospectComments.prospectId, prospectId))
      .orderBy(asc(prospectComments.createdAt));
    return rows;
  });
}
