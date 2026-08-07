"use server";

/**
 * "Start onboarding" — one button replacing three manual steps.
 *
 * This file is the AUTHORIZATION boundary and nothing else. It checks the
 * caller is a Business Builder with access to this client, runs the
 * pre-flight, claims the run row, and hands off to a background function
 * that does the actual sending a couple of minutes apart.
 *
 * The split matters: by the time the sends run there is no Clerk session
 * (see `lib/onboarding/steps.ts`), so the question of who is allowed to
 * do this has to be settled here, while a session still exists.
 *
 * Deliberately a button, not something that fires when the agreement is
 * signed. The third step drops the client into their portal, and that
 * must not happen before the modules and the Soul File are ready.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, onboardingRuns } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import {
  checkOnboardingReadiness,
  type OnboardingBlocker,
} from "@/lib/onboarding/preflight";
import { runNextOnboardingStep } from "@/lib/onboarding/sequence";

export type StartOnboardingResult =
  | { ok: true }
  | { ok: false; error: string; blockers?: OnboardingBlocker[] };

/**
 * Short name per blocker, for the one-line refusal. The blocker's own
 * `message` is the full sentence with the fix in it; this is the phrase
 * that goes in "can't start yet — X and Y".
 *
 * Not exported: a `"use server"` module may only export async functions.
 */
const BLOCKER_SUMMARY: Record<OnboardingBlocker["key"], string> = {
  monthly_fee: "no monthly fee is set",
  first_session: "no first session is scheduled",
  contact_email: "there's no contact email",
  portal_modules: "the portal modules haven't been reviewed",
};

function listSentence(parts: string[]): string {
  if (parts.length === 0) return "the pre-flight didn't pass";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export async function startOnboarding(
  engagementId: string,
): Promise<StartOnboardingResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  if (!(await canCurrentBbAccessEngagement(engagementId)))
    return { ok: false, error: "You don't have access to that client." };

  // Pre-flight. Refuses with the specific reason and a link to the fix —
  // there is no override, because a failing check means the record is
  // wrong and the record is what the client is about to be shown. A
  // half-run sequence cannot be undone; a blocked one costs a minute.
  const readiness = await checkOnboardingReadiness(engagementId);
  if (!readiness.ready) {
    // Name them. A count ("One thing needs sorting") tells the operator
    // there is a problem and nothing about which one — and the caller
    // renders `blockers` underneath this sentence, so the summary should
    // agree with the list rather than replace it with arithmetic.
    const named = readiness.blockers.map((b) => BLOCKER_SUMMARY[b.key]);
    return {
      ok: false,
      error: `Onboarding can't start yet — ${listSentence(named)}.`,
      blockers: readiness.blockers,
    };
  }

  const orgId = await withSystemContext(async (tx) => {
    const [e] = await tx
      .select({ orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    return e?.orgId ?? null;
  });
  if (!orgId) return { ok: false, error: "Client not found." };

  // Claim the run. The UNIQUE constraint on engagement_id is the
  // double-fire guard, and it is deliberately the database's job: a
  // check-then-insert would let two clicks a second apart both pass and
  // send the client two welcome emails.
  try {
    await withSystemContext((tx) =>
      tx.insert(onboardingRuns).values({
        orgId,
        engagementId,
        startedByUserProfileId: profile.userProfileId,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) {
      return {
        ok: false,
        error:
          "Onboarding has already been started for this client. Check the onboarding panel for what has been sent.",
      };
    }
    console.error("[onboarding] could not claim the run:", e);
    return { ok: false, error: "Couldn't start onboarding. Try again." };
  }

  return advance(engagementId);
}

/**
 * Re-run the steps that haven't landed. Skips any step with a timestamp,
 * so a retry after a failure never re-sends what already went.
 */
export async function resumeOnboarding(
  engagementId: string,
): Promise<StartOnboardingResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  if (!(await canCurrentBbAccessEngagement(engagementId)))
    return { ok: false, error: "You don't have access to that client." };

  const run = await withSystemContext(async (tx) => {
    const [r] = await tx
      .select()
      .from(onboardingRuns)
      .where(eq(onboardingRuns.engagementId, engagementId))
      .limit(1);
    return r ?? null;
  });
  if (!run) return { ok: false, error: "Onboarding hasn't been started yet." };
  if (run.completedAt) return { ok: false, error: "Onboarding already finished." };

  return advance(engagementId);
}

/**
 * Send the next outstanding step HERE, in front of the operator, then
 * hand the rest to the background function for the stagger.
 *
 * **Why the first step no longer waits on the hand-off.** A Netlify
 * Background Function answers 202 the moment the request is accepted,
 * before its handler runs — so the old code's "202 means it started" was
 * a check of nothing, and when the hand-off silently failed there was no
 * other way to move the sequence at all. A real client sat behind a
 * spinner for a working day. Now the operator always gets a true answer
 * about the step that just ran, and pressing the button again advances
 * the next one even if the background runner is dead.
 *
 * One step is one send — well inside Netlify's ~26s synchronous ceiling.
 * The stagger is what needs a background budget, not the sending.
 */
async function advance(engagementId: string): Promise<StartOnboardingResult> {
  const step = await runNextOnboardingStep(engagementId);
  revalidatePath(`/business-builder/engagements/${engagementId}`);
  if (!step.ok) return { ok: false, error: step.error };
  if (step.done) return { ok: true };

  // More steps to go. The hand-off's failure is recorded but is NOT
  // reported as a failure of the run — the step that just ran did send,
  // and the operator can advance the rest by hand from the panel.
  const handoff = await enqueue(engagementId);
  if (handoff) {
    await withSystemContext((tx) =>
      tx
        .update(onboardingRuns)
        .set({ backgroundError: handoff.slice(0, 500) })
        .where(eq(onboardingRuns.engagementId, engagementId)),
    );
    revalidatePath(`/business-builder/engagements/${engagementId}`);
  }
  return { ok: true };
}

/**
 * Hand off to the background function for the remaining, staggered steps.
 * Returns an error string on failure, null on success. Not exported — a
 * `"use server"` module may only export async server actions.
 *
 * NOTE: a 202 here means Netlify accepted the request, NOT that the
 * handler ran. `onboarding_runs.background_started_at`, stamped by the
 * handler itself, is the only evidence that it did.
 */
async function enqueue(engagementId: string): Promise<string | null> {
  const baseUrl =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) {
    return "Onboarding isn't configured on the server (missing URL or CRON_SECRET). Nothing was sent.";
  }
  try {
    const resp = await fetch(
      `${baseUrl}/.netlify/functions/start-onboarding-background`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ engagementId }),
      },
    );
    // A non-202 means Netlify did not even accept the request. A 202
    // means it did — and NOTHING more; the handler has not run yet. Do
    // not read success into it.
    if (resp.status !== 202 && !resp.ok) {
      return `The onboarding runner didn't accept the hand-off (HTTP ${resp.status}). The remaining steps haven't been queued.`;
    }
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  // Stamped so the panel can say how long a run has been waiting to be
  // picked up, and call it stalled rather than spinning for ever.
  await withSystemContext((tx) =>
    tx
      .update(onboardingRuns)
      .set({ lastQueuedAt: new Date() })
      .where(eq(onboardingRuns.engagementId, engagementId)),
  ).catch(() => {});
  return null;
}
