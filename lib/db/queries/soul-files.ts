/**
 * Soul Files — read queries (server-side only).
 *
 * Phase 1.7 surface: one query, returns the engagement's Soul File
 * with the most recent editor's name, or null if none exists yet.
 */

import { eq } from "drizzle-orm";
import { soulFiles, userProfiles } from "../schema";
import { withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type LoadedSoulFile = {
  id: string;
  body: string;
  lastEditorName: string | null;
  updatedAt: Date;
};

export async function getSoulFileForEngagement(
  engagementId: string,
): Promise<LoadedSoulFile | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  return withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .select({
        id: soulFiles.id,
        body: soulFiles.body,
        updatedAt: soulFiles.updatedAt,
        lastEditorName: userProfiles.fullName,
      })
      .from(soulFiles)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, soulFiles.lastEditorUserProfileId),
      )
      .where(eq(soulFiles.engagementId, engagementId))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      body: row.body,
      lastEditorName: row.lastEditorName,
      updatedAt: row.updatedAt,
    };
  });
}
