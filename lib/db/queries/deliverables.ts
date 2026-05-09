import { eq } from "drizzle-orm";
import { deliverables, type Deliverable } from "../schema";
import { withEngagementContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export async function listEngagementDeliverables(
  engagementId: string,
): Promise<Deliverable[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) =>
        tx
          .select()
          .from(deliverables)
          .where(eq(deliverables.engagementId, engagementId)),
    );
  } catch {
    return [];
  }
}
