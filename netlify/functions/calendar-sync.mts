/**
 * Periodic Google Calendar → BBS sessions sync trigger.
 *
 * Netlify Scheduled Function — a thin trigger that calls the Next.js
 * cron route, where the real work lives (full app/db context). Mirrors
 * the `email-due-soon` setup so there's one pattern to maintain.
 *
 * Schedule: `0 14-23 * * 1-5` — hourly, Mon–Fri during Bruce's working
 * window (14:00–23:59 UTC ≈ 8am–6pm MST / 7am–5pm MDT). The sync only
 * reads Google and writes session rows, so there's no email window to
 * respect — but restricting it to the workday lets Neon scale to zero
 * overnight and on weekends, which is what keeps the compute bill down.
 * Newly-booked client meetings surface in the portal within the hour
 * during work hours; a meeting booked overnight shows up next morning.
 * (Lead-response follow-ups run separately in `booking-follow-through.mts`,
 * which stays 24/7 — this job is not on the lead-response path.)
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 14-23 * * 1-5", async () => {
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
