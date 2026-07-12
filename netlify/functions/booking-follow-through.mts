/**
 * Booking follow-through trigger.
 *
 * Netlify Scheduled Function — runs every 15 minutes and calls the
 * Next.js cron route, which does the real work (find due booking emails,
 * POST each to the Make send webhook, stamp on success). Keeping the logic
 * in the Next.js route means one place with full app/db context.
 *
 * Schedule: every 15 minutes. Email 1 must go out within 30 minutes of a
 * booking landing, so a 15-minute cadence keeps us comfortably inside that.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("*/15 * * * *", async () => {
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

  const resp = await fetch(`${url}/api/cron/booking-follow-through`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
