import { eq } from "drizzle-orm";
import {
  personProfiles,
  userProfiles,
  type PersonProfile,
} from "../schema";
import { withEngagementContext, withSystemContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ListedPersonProfile = PersonProfile & {
  linkedFullName: string | null;
};

export async function listEngagementPersonProfiles(
  engagementId: string,
): Promise<ListedPersonProfile[]> {
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
            profile: personProfiles,
            linkedFullName: userProfiles.fullName,
          })
          .from(personProfiles)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, personProfiles.userProfileId),
          )
          .where(eq(personProfiles.engagementId, engagementId));
        return rows.map((r) => ({
          ...r.profile,
          linkedFullName: r.linkedFullName,
        }));
      },
    );
  } catch {
    return [];
  }
}

export async function getPersonProfile(
  id: string,
): Promise<ListedPersonProfile | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const engagementId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ engagementId: personProfiles.engagementId })
      .from(personProfiles)
      .where(eq(personProfiles.id, id))
      .limit(1);
    return row?.engagementId ?? null;
  });
  if (!engagementId) return null;
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select({
            profile: personProfiles,
            linkedFullName: userProfiles.fullName,
          })
          .from(personProfiles)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, personProfiles.userProfileId),
          )
          .where(eq(personProfiles.id, id))
          .limit(1);
        if (!row) return null;
        return { ...row.profile, linkedFullName: row.linkedFullName };
      },
    );
  } catch {
    return null;
  }
}
