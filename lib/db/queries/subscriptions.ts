import { eq } from "drizzle-orm";
import {
  subscriptionAssets,
  type SubscriptionAsset,
} from "../schema";
import { withEngagementContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export async function listEngagementSubscriptions(
  engagementId: string,
): Promise<SubscriptionAsset[]> {
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
          .from(subscriptionAssets)
          .where(eq(subscriptionAssets.engagementId, engagementId)),
    );
  } catch {
    return [];
  }
}
