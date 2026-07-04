/**
 * Daily stale-lead nudge trigger.
 *
 * Netlify Scheduled Function — thin trigger that calls the Next.js cron
 * route, which does the actual scan + notification insert with full app
 * context. Mirrors the email-due-soon trigger.
 *
 * Schedule: `0 17 * * 1-5` — 17:00 UTC, Mon–Fri:
 *   - 10:00 MST (winter) / 11:00 MDT (summer) — both inside Bruce's
 *     working window (8:30am–6:00pm MT), year-round, no DST math.
 * Runs an hour after the due-soon nudge so the two don't overlap.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 17 * * 1-5", async () => {
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

  const resp = await fetch(`${url}/api/cron/stale-leads`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
