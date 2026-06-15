/**
 * Periodic Google Calendar → BBS sessions sync trigger.
 *
 * Netlify Scheduled Function — a thin trigger that calls the Next.js
 * cron route, where the real work lives (full app/db context). Mirrors
 * the `email-due-soon` setup so there's one pattern to maintain.
 *
 * Schedule: `*/30 * * * *` — every 30 minutes, around the clock. The
 * sync only reads Google and writes session rows; it sends no email or
 * notification, so there's no working-hours window to respect, and
 * newly-booked client meetings surface in the portal within half an hour.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("*/30 * * * *", async () => {
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

  const resp = await fetch(`${url}/api/cron/calendar-sync`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
