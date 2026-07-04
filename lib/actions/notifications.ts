"use server";

/**
 * Notifications — server actions (mutations).
 *
 * Phase 1.2: only `markAllNotificationsRead`. Per-item read tracking is
 * a Phase 2 polish; Phase 1.2 fires this on the notifications page
 * mount via a tiny client effect.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { notifications } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }

  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .update(notifications)
        .set({ readAt: sql`now()` })
        .where(
          and(
            eq(notifications.userProfileId, profile.userProfileId),
            isNull(notifications.readAt),
          ),
        );
    });
    revalidatePath("/portal");
    revalidatePath("/portal/notifications");
    // Business Builder side — refresh the sidebar unread badge + feed.
    revalidatePath("/business-builder", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
