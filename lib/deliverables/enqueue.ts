/**
 * Start a document-drafting job.
 *
 * NO `"use server"` — deliberately. This was a private helper inside
 * `lib/actions/deliverables-fireflies.ts`, which meant only a server
 * action could reach it. The meeting extractor now needs it too, and it
 * runs inside a Netlify Background Function where there is no Clerk
 * session and every export of a `"use server"` module would become a
 * browser-reachable POST endpoint. Same rule as
 * `lib/integrations/fireflies-sync.ts` and `lib/meetings/transcript.ts`.
 *
 * Authorization happens at the two call sites, both of which have
 * already established who is asking; this function only dispatches.
 */

export type DraftJobPayload = {
  source: "meeting" | "session";
  sourceId: string;
  type: string;
  title?: string;
  deliverableId: string;
};

/**
 * Returns null on success, or a human-readable reason the job did not
 * start. Never throws — a failed dispatch must not take down the
 * extraction run that requested it.
 */
export async function enqueueDeliverableDraft(
  payload: DraftJobPayload,
): Promise<string | null> {
  const baseUrl =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) {
    return "Background drafting isn't configured on the server (missing URL or CRON_SECRET).";
  }
  try {
    const resp = await fetch(
      `${baseUrl}/.netlify/functions/draft-deliverable-background`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    // Background functions answer 202 Accepted. Anything else means the
    // job never started — surface it rather than pretending it runs.
    if (resp.status !== 202 && !resp.ok) {
      return `Couldn't start the drafting job (HTTP ${resp.status}). Try again in a moment.`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Couldn't start the drafting job.";
  }
}
