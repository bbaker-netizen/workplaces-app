/**
 * Periodic EA-sheet -> Builder status mirror trigger.
 *
 * Netlify Scheduled Function — a thin trigger that calls the Next.js cron
 * route, where the real work lives (full app/db context). Mirrors the
 * `fireflies-sync` setup so there's one pattern to maintain.
 *
 * Schedule: `*\/30 14-23 * * 1-5` — every 30 minutes, Mon–Fri during
 * Bruce's working window (14:00–23:59 UTC ≈ 8am–6pm MST / 7am–5pm MDT).
 * This is the reverse leg, bringing status changes Bruce makes in Command
 * Central back to the Builder — and Bruce only edits Command Central
 * during work hours, so there's nothing to mirror overnight. Restricting
 * to the workday lets Neon scale to zero the rest of the time, which is
 * what keeps the compute bill down. (Star-slash escaped as `*\/30` so it
 * doesn't close this JSDoc block early.)
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("*/30 14-23 * * 1-5", async () => {
  const url = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
  if (!url) {
    return {
      statusCode: 500,
      body: "URL env var missing — Netlify normally injects this.",
    };
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { statusCode: 500, body: "CRON_SECRET env var missing." };
  }

  const resp = await fetch(`${url}/api/cron/ea-sync`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
