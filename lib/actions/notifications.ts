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
import { listBusinessBuilderNotifications } from "@/lib/db/queries/notifications";
import { scanFollowupsDue } from "@/lib/notifications/followups";

/**
 * Run the follow-up-due scan on demand (the "Check now" button). Same scan
 * the daily cron runs, but session-authed so a coach can pull due follow-ups
 * without waiting for the morning job. Returns how many reminders it created.
 */
export async function checkFollowupsNow(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    const { created } = await scanFollowupsDue();
    revalidatePath("/business-builder/settings/notifications");
    revalidatePath("/business-builder", "layout");
    return { ok: true, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }
}

/** Slim notification shape the in-app toaster polls for. */
export type ToastNotification = {
  id: string;
  createdAtMs: number;
  label: string;
  href: string | null;
  read: boolean;
};

/**
 * Recent notifications for the in-app toaster (Business Builder side).
 * Only rows we can describe (have a context label) are returned; the client
 * pops a toast for any that are unread and newer than what it's already
 * seen. Reuses the same enriched feed as the sidebar bell, so toasts and
 * the bell stay in sync.
 */
export async function getToastNotifications(): Promise<ToastNotification[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  const rows = await listBusinessBuilderNotifications();
  return rows
    .filter((n) => n.contextLabel)
    .slice(0, 15)
    .map((n) => ({
      id: n.id,
      createdAtMs:
        n.createdAt instanceof Date
          ? n.createdAt.getTime()
          : new Date(n.createdAt as unknown as string).getTime(),
      label: n.contextLabel as string,
      href: n.href,
      read: n.readAt != null,
    }));
}

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
