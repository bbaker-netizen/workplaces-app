"use server";

/**
 * Server actions for the user-facing Google Calendar Connect button +
 * disconnect flow.
 */

import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { disconnectUserTokens } from "@/lib/integrations/google-calendar";

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
