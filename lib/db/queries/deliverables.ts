import { eq } from "drizzle-orm";
import { deliverables, userProfiles, type Deliverable } from "../schema";
import { withEngagementContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type DeliverableWithCompleter = Deliverable & {
  completedByName: string | null;
};

export async function listEngagementDeliverables(
  engagementId: string,
): Promise<DeliverableWithCompleter[]> {
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
            deliverable: deliverables,
            completedByName: userProfiles.fullName,
          })
          .from(deliverables)
          .leftJoin(
            userProfiles,
            eq(userProfiles.id, deliverables.completedByUserProfileId),
          )
          .where(eq(deliverables.engagementId, engagementId));
        return rows.map((r) => ({
          ...r.deliverable,
          completedByName: r.completedByName,
        }));
      },
    );
  } catch {
    return [];
  }
}
