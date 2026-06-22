"use server";

/**
 * Mark the current Business Builder's first-login onboarding complete.
 * Called when they dismiss the welcome checklist (or click into any setup
 * step from it) so it never blocks them again. Idempotent.
 */

import { eq } from "drizzle-orm";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";

export async function completeBuilderOnboarding(): Promise<{ ok: boolean }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false };
  }
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(userProfiles)
        .set({ onboardingCompletedAt: new Date() })
        .where(eq(userProfiles.id, profile.userProfileId));
    });
    return { ok: true };
  } catch (e) {
    console.error("[onboarding] completeBuilderOnboarding failed", e);
    return { ok: false };
  }
}
