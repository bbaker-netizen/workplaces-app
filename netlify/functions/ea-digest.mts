/**
 * Morning briefing trigger.
 *
 * Netlify Scheduled Function — a thin trigger that calls the Next.js
 * cron route, where the real work lives. Mirrors the `fireflies-sync`
 * setup so there's one pattern to maintain.
 *
 * Schedule: `0 13 * * 1-5` — 13:00 UTC weekdays, which is 07:00 MDT in
 * summer and 06:00 MST in winter. Pinned to UTC because that is what the
 * scheduler accepts; a true fixed 07:00 MT would need two schedules, and
 * arriving an hour early in winter is the harmless side of that trade.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 13 * * 1-5", async () => {
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

  const resp = await fetch(`${url}/api/cron/ea-digest`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return { statusCode: resp.ok ? 200 : 502, body: text.slice(0, 4096) };
});
