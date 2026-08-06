/**
 * Run the three onboarding sends, in order, spaced out.
 *
 * **The stagger is the point.** Three emails from a practice a client
 * has just signed with, arriving in the same second, one of them asking
 * for banking details, reads as either a glitch or a phishing attempt.
 * Spaced a couple of minutes apart and led by an email that says what is
 * coming, it reads as a person working through an onboarding.
 *
 * **Every step is recorded before the next one starts.** These sends
 * cannot be recalled, so the only failure that matters is the partial
 * one, and the run row has to be able to say exactly which of the three
 * went. A step that fails stops the sequence — sending the portal invite
 * after the onboarding email failed would drop the client into a
 * workspace with no explanation of why they were there.
 *
 * Resuming re-runs only the steps with no timestamp, so a retry after a
 * failure never re-sends what already landed.
 */

import { eq } from "drizzle-orm";
import { onboardingRuns, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  sendOnboardingEmail,
  sendPaymentAuthorization,
  sendPersonProfileAssessment,
  sendPortalInvite,
  type OnboardingActor,
} from "./steps";

/**
 * Gap between sends. Two minutes: long enough that the client reads the
 * first email before the second arrives, short enough to sit inside a
 * Netlify Background Function's 15-minute budget with room to spare.
 */
const STEP_GAP_MS = 2 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SequenceOutcome = {
  welcomeEmail: "sent" | "failed" | "skipped";
  pad: "sent" | "failed" | "skipped";
  portalInvite: "sent" | "failed" | "skipped";
  assessment: "sent" | "failed" | "skipped";
};

export async function runOnboardingSequence(
  engagementId: string,
): Promise<SequenceOutcome> {
  const outcome: SequenceOutcome = {
    welcomeEmail: "skipped",
    pad: "skipped",
    portalInvite: "skipped",
    assessment: "skipped",
  };

  const loaded = await withSystemContext(async (tx) => {
    const [run] = await tx
      .select()
      .from(onboardingRuns)
      .where(eq(onboardingRuns.engagementId, engagementId))
      .limit(1);
    if (!run) return null;
    if (!run.startedByUserProfileId) return { run, actor: null };
    const [u] = await tx
      .select({
        id: userProfiles.id,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
        clerkUserId: userProfiles.clerkUserId,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, run.startedByUserProfileId))
      .limit(1);
    return { run, actor: u ?? null };
  });

  if (!loaded) {
    console.error(`[onboarding] no run row for engagement ${engagementId}`);
    return outcome;
  }
  if (!loaded.actor) {
    await recordError(engagementId, "welcomeEmailError", "The Business Builder who started this could not be resolved.");
    outcome.welcomeEmail = "failed";
    return outcome;
  }

  const actor: OnboardingActor = {
    userProfileId: loaded.actor.id,
    fullName: loaded.actor.fullName,
    email: loaded.actor.email,
    clerkUserId: loaded.actor.clerkUserId,
  };
  const run = loaded.run;

  // ---- step 1: onboarding email ----
  if (!run.welcomeEmailSentAt) {
    const r = await sendOnboardingEmail(engagementId, actor);
    if (r.ok) {
      outcome.welcomeEmail = "sent";
      await stamp(engagementId, { welcomeEmailSentAt: new Date(), welcomeEmailError: null });
    } else {
      outcome.welcomeEmail = "failed";
      await recordError(engagementId, "welcomeEmailError", r.error);
      // Stop here. The next two emails only make sense after the one
      // that explains them.
      return outcome;
    }
  }

  // ---- step 2: payment authorization ----
  if (!run.padSentAt) {
    await sleep(STEP_GAP_MS);
    const r = await sendPaymentAuthorization(engagementId, actor);
    if (r.ok) {
      outcome.pad = "sent";
      await stamp(engagementId, { padSentAt: new Date(), padError: null });
    } else {
      outcome.pad = "failed";
      await recordError(engagementId, "padError", r.error);
      return outcome;
    }
  }

  // ---- step 3: portal invite ----
  if (!run.portalInviteSentAt) {
    await sleep(STEP_GAP_MS);
    const r = await sendPortalInvite(engagementId, actor);
    if (r.ok) {
      outcome.portalInvite = "sent";
      await stamp(engagementId, {
        portalInviteSentAt: new Date(),
        portalInviteError: null,
      });
    } else {
      outcome.portalInvite = "failed";
      await recordError(engagementId, "portalInviteError", r.error);
      return outcome;
    }
  }

  // ---- step 4: Person Profile assessment ----
  // A missing assessment URL is a skip, not a failure: the run still
  // completes, and the reason is on the record so it is visible rather
  // than silent. Everything else here matches steps one to three.
  if (!run.assessmentSentAt) {
    await sleep(STEP_GAP_MS);
    const r = await sendPersonProfileAssessment(engagementId, actor);
    if (r.ok && r.skipped) {
      outcome.assessment = "skipped";
      await stamp(engagementId, {
        assessmentError:
          "No Person Profile link is set for the practice, so this step was skipped.",
        completedAt: new Date(),
      });
      return outcome;
    }
    if (r.ok) {
      outcome.assessment = "sent";
      await stamp(engagementId, {
        assessmentSentAt: new Date(),
        assessmentError: null,
        completedAt: new Date(),
      });
    } else {
      outcome.assessment = "failed";
      await recordError(engagementId, "assessmentError", r.error);
      return outcome;
    }
  }

  return outcome;
}

async function stamp(
  engagementId: string,
  values: Partial<typeof onboardingRuns.$inferInsert>,
): Promise<void> {
  try {
    await withSystemContext((tx) =>
      tx
        .update(onboardingRuns)
        .set(values)
        .where(eq(onboardingRuns.engagementId, engagementId)),
    );
  } catch (e) {
    // A failed stamp must never throw out of the sequence — the email it
    // records has already gone, and losing the record is bad but losing
    // the remaining steps as well is worse.
    console.error("[onboarding] could not record step state:", e);
  }
}

async function recordError(
  engagementId: string,
  field:
    | "welcomeEmailError"
    | "padError"
    | "portalInviteError"
    | "assessmentError",
  message: string,
): Promise<void> {
  console.error(`[onboarding] ${engagementId} ${field}: ${message}`);
  await stamp(engagementId, { [field]: message.slice(0, 500) });
}
