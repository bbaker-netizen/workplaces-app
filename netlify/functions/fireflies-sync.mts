/**
 * Periodic Fireflies → engagement meeting-notes sync trigger.
 *
 * Netlify Scheduled Function — a thin trigger that calls the Next.js
 * cron route, where the real work lives (full app/db context). Mirrors
 * the `calendar-sync` setup so there's one pattern to maintain.
 *
 * Schedule: `0 * * * *` — hourly. Fireflies recaps land a few minutes
 * after each call ends, so an hourly pull keeps every client's meeting
 * notes (including their recurring Business Building sessions) current
 * without hammering the Fireflies API. The job only reads Fireflies and
 * upserts rows; it sends no email or notification, so there's no
 * working-hours window to respect.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 * * * *", async () => {
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

  const resp = await fetch(`${url}/api/cron/fireflies-sync`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
