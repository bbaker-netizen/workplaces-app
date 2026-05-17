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
  // The billing-link columns from migration 0031 are SELECT-ed by
  // `select()` (Drizzle expands every column from the schema). If
  // production hasn't applied that migration yet, the query throws
  // with "column does not exist." Fall back to the pre-0031 column
  // set so the page still renders.
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
  } catch (e) {
    console.warn(
      "[listEngagementSubscriptions] full SELECT failed — falling back to pre-0031 column set. Apply migration 0031_subscription_billing_links.sql to remove this fallback.",
      e instanceof Error ? e.message : e,
    );
    try {
      return await withEngagementContext(
        profile.orgId,
        profile.role,
        engagementId,
        async (tx) =>
          tx
            .select({
              id: subscriptionAssets.id,
              orgId: subscriptionAssets.orgId,
              engagementId: subscriptionAssets.engagementId,
              productId: subscriptionAssets.productId,
              name: subscriptionAssets.name,
              vendor: subscriptionAssets.vendor,
              monthlyCostCents: subscriptionAssets.monthlyCostCents,
              currency: subscriptionAssets.currency,
              paidBy: subscriptionAssets.paidBy,
              model: subscriptionAssets.model,
              transferStatus: subscriptionAssets.transferStatus,
              notes: subscriptionAssets.notes,
              renewalDate: subscriptionAssets.renewalDate,
              createdAt: subscriptionAssets.createdAt,
              updatedAt: subscriptionAssets.updatedAt,
            })
            .from(subscriptionAssets)
            .where(eq(subscriptionAssets.engagementId, engagementId)),
      ).then((rows) =>
        rows.map((r) => ({
          ...r,
          billingProvider: null,
          qboInvoiceId: null,
          qboCustomerId: null,
          stripeSubscriptionId: null,
          stripePriceId: null,
          billingExternalUrl: null,
        })),
      );
    } catch {
      return [];
    }
  }
}
