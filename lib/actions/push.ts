"use server";

/**
 * Web Push subscription management (Business Builder side).
 *
 * The client asks the browser for a PushSubscription (via the push-only
 * service worker), then hands the endpoint + keys here to store. One row
 * per device; re-subscribing the same endpoint upserts.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { pushSubscriptions } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().max(500).optional(),
});

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid subscription payload." };
  }
  const { endpoint, p256dh, auth, userAgent } = parsed.data;

  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .insert(pushSubscriptions)
        .values({
          orgId: profile.orgId,
          userProfileId: profile.userProfileId,
          endpoint,
          p256dh,
          auth,
          userAgent: userAgent ?? null,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            orgId: profile.orgId,
            userProfileId: profile.userProfileId,
            p256dh,
            auth,
            userAgent: userAgent ?? null,
            updatedAt: new Date(),
          },
        });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }
}

export async function deletePushSubscription(
  endpoint: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.userProfileId, profile.userProfileId),
          ),
        );
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }
}
