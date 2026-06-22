/**
 * Business Builder first-login onboarding state.
 *
 * Reads the current Business Builder's setup progress for the welcome
 * checklist: whether they've been welcomed yet, plus real completion of
 * the server-trackable steps (Google connected, e-signature uploaded,
 * email signature set). The tour + guide steps are tracked client-side.
 *
 * Fail-safe: any read error degrades to "already onboarded" so the
 * checklist can never block the console (same defensive posture as
 * bb-access).
 */

import { eq } from "drizzle-orm";
import { googleCalendarTokens, userProfiles } from "../schema";
import { withSystemContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type BuilderOnboardingState = {
  needsOnboarding: boolean;
  firstName: string;
  googleConnected: boolean;
  hasSignature: boolean;
  hasEmailSignature: boolean;
};

const SKIP: BuilderOnboardingState = {
  needsOnboarding: false,
  firstName: "",
  googleConnected: false,
  hasSignature: false,
  hasEmailSignature: false,
};

export async function getBuilderOnboardingState(): Promise<BuilderOnboardingState> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return SKIP;
  if (profile.role !== "master_admin" && profile.role !== "coach") return SKIP;

  const firstName = profile.fullName.split(" ")[0] || profile.fullName;

  try {
    return await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          onboardingCompletedAt: userProfiles.onboardingCompletedAt,
          signatureImageData: userProfiles.signatureImageData,
          emailSignature: userProfiles.emailSignature,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);

      // Treat a missing row or already-set timestamp as "done".
      const needsOnboarding = !!row && row.onboardingCompletedAt === null;

      const [google] = await tx
        .select({ userProfileId: googleCalendarTokens.userProfileId })
        .from(googleCalendarTokens)
        .where(eq(googleCalendarTokens.userProfileId, profile.userProfileId))
        .limit(1);

      return {
        needsOnboarding,
        firstName,
        googleConnected: !!google,
        hasSignature: !!row?.signatureImageData,
        hasEmailSignature: !!(row?.emailSignature && row.emailSignature.trim()),
      };
    });
  } catch (e) {
    console.error("[onboarding] getBuilderOnboardingState failed", e);
    return SKIP;
  }
}
