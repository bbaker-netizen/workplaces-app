/**
 * Daily follow-up-due reminder trigger.
 *
 * Netlify Scheduled Function — thin trigger that calls the Next.js cron
 * route, which does the scan + notification insert with full app context.
 * Mirrors the stale-leads trigger.
 *
 * Schedule: `0 15 * * 1-5` — 15:00 UTC, Mon–Fri:
 *   - 08:00 MST (winter) / 09:00 MDT (summer) — start of Bruce's working
 *     window, so the day opens with the leads that need a follow-up.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 15 * * 1-5", async () => {
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

  const resp = await fetch(`${url}/api/cron/followups-due`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
