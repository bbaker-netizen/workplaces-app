/**
 * Background: run a client's onboarding sequence.
 *
 * The `-background` suffix makes this a Netlify Background Function — it
 * returns 202 immediately and runs for up to 15 minutes. That budget is
 * the reason it exists: the three sends are deliberately spaced a couple
 * of minutes apart, and a server action is killed at Netlify's ~26s
 * synchronous ceiling on this plan, which would leave the run half-done
 * with two emails already gone and no way to recall them.
 *
 * It is NOT a scheduled function. A cron frequent enough to drive a
 * two-minute gap would run all day for something that happens a handful
 * of times a month.
 *
 * Trigger: POST from the `startOnboarding` server action, guarded by
 * `Bearer ${CRON_SECRET}` so the public function URL can't be used to
 * email a client on this practice's behalf.
 */

import type { Context } from "@netlify/functions";
import { runOnboardingSequence } from "../../lib/onboarding/sequence";

type Payload = { engagementId?: string };

export default async (req: Request, _context: Context) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("start-onboarding: CRON_SECRET not set.");
    return new Response("Not configured", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { engagementId } = body;
  if (!engagementId) {
    return new Response("Missing engagementId", { status: 400 });
  }

  // Background functions return 202 immediately and the platform ignores
  // the result, so every outcome is logged. The run row is the record a
  // person actually reads — `runOnboardingSequence` writes each step's
  // state there before moving on, including failures.
  try {
    const outcome = await runOnboardingSequence(engagementId);
    console.log(
      `start-onboarding: ${engagementId} — email=${outcome.welcomeEmail} ` +
        `pad=${outcome.pad} invite=${outcome.portalInvite}`,
    );
  } catch (e) {
    console.error(`start-onboarding: ${engagementId} threw:`, e);
  }
};
