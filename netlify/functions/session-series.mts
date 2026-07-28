/**
 * Recurring-meeting horizon trigger.
 *
 * Netlify Scheduled Function — a thin trigger that calls the Next.js
 * cron route, where the real work lives (full app/db context). Mirrors
 * the `fireflies-sync` setup so there's one pattern to maintain.
 *
 * Schedule: `0 8 * * *` — 08:00 UTC nightly, which is 01:00 MST / 02:00
 * MDT. Deliberately outside Bruce's working window: a sweep across every
 * active series never competes with real traffic, and nobody is waiting
 * on the result. Daily rather than hourly because the horizon it
 * maintains is ~90 days out — there is nothing a second run in the same
 * day could add, and an idle nightly wake is the cheapest schedule that
 * still keeps the horizon from ever running down.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 8 * * *", async () => {
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

  const resp = await fetch(`${url}/api/cron/session-series`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
