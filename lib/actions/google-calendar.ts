"use server";

/**
 * Server actions for the user-facing Google connection — Connect button,
 * Disconnect, manual "Sync Gmail now" trigger.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { googleCalendarTokens } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";
import { disconnectUserTokens } from "@/lib/integrations/google-calendar";
import { syncOneUser, type SyncSummary } from "@/lib/integrations/gmail-sync";

export async function disconnectGoogleCalendar(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  try {
    await disconnectUserTokens(profile.orgId, profile.userProfileId);
    revalidatePath("/coach/profile/google-calendar");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

/**
 * Trigger a Gmail sync for the current user. Manual button; the cron
 * route at /api/cron/gmail-sync handles scheduled refreshes.
 */
export async function syncMyGmailNow(): Promise<
  { ok: true; data: SyncSummary } | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  const summary = await syncOneUser(profile.userProfileId);
  revalidatePath("/coach/profile/google-calendar");
  revalidatePath("/coach/inbox");
  if (!summary.ok) {
    return { ok: false, error: summary.error ?? "Sync failed." };
  }
  return { ok: true, data: summary };
}

/**
 * Toggle Gmail capture on / off without disconnecting Calendar.
 */
export async function setGmailSyncEnabled(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  try {
    await withTenantContext(profile.orgId, async (tx) => {
      await tx
        .update(googleCalendarTokens)
        .set({ gmailSyncEnabled: enabled, updatedAt: new Date() })
        .where(eq(googleCalendarTokens.userProfileId, profile.userProfileId));
    });
    revalidatePath("/coach/profile/google-calendar");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}
