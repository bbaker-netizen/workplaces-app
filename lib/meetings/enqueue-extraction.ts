/**
 * Start the draft-from-transcript job for a meeting.
 *
 * NO `"use server"` — same rule as `lib/integrations/fireflies-sync.ts`
 * and `lib/deliverables/enqueue.ts`. The hourly sync calls this with no
 * signed-in user, and an unguarded function that spends Claude credits
 * must not also be a browser-reachable POST endpoint. The guarded
 * server action for the manual button stays in `lib/actions/
 * fireflies-extract.ts`.
 *
 * Never throws: a dispatch failure must not take down the sync that
 * requested it. Returns null on success, a reason otherwise.
 */

export async function enqueueMeetingExtraction(
  meetingId: string,
): Promise<string | null> {
  const baseUrl =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) {
    return "Background drafting isn't configured (missing URL or CRON_SECRET).";
  }
  try {
    const resp = await fetch(
      `${baseUrl}/.netlify/functions/extract-meeting-action-items-background`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetingId }),
      },
    );
    if (resp.status !== 202 && !resp.ok) {
      return `Extraction job didn't start (HTTP ${resp.status}).`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Extraction job didn't start.";
  }
}
