/**
 * Keep-warm ping.
 *
 * Netlify spins the server function down after a few minutes idle, and
 * waking it back up takes 2-3 seconds — which is the lag (and the
 * occasional outright failure) on the first sign-in after a quiet
 * stretch. The database itself is fast even when cold (~0.3s measured),
 * so the server's cold start is the real culprit.
 *
 * This scheduled function makes one tiny request every 5 minutes so
 * Netlify keeps a warm instance ready. It just touches the public
 * homepage — no auth, no database work — which is enough to keep the
 * shared server-render function warm for every route, including the
 * post-sign-in dashboards.
 *
 * Cost is trivial: one small request every 5 minutes.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("*/5 * * * *", async () => {
  const url = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
  if (!url) {
    return { statusCode: 500, body: "URL env var missing — Netlify normally injects this." };
  }

  try {
    const resp = await fetch(url, { headers: { "x-keep-warm": "1" } });
    return { statusCode: 200, body: `warmed (${resp.status})` };
  } catch (e) {
    // Best effort — a failed ping just means we try again in 5 minutes.
    return { statusCode: 200, body: `ping failed, will retry: ${(e as Error).message}` };
  }
});
