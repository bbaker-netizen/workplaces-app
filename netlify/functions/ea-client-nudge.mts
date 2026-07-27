/**
 * Weekly client chase trigger.
 *
 * Schedule: `0 16 * * 1` — Monday 16:00 UTC, which is 10:00 MDT /
 * 09:00 MST. Inside the working window year-round, because unlike the
 * morning briefing this one goes to CLIENTS and honours the same
 * working-hours rule as every other outbound email.
 *
 * Monday morning on purpose: a week's commitments are still salvageable
 * on a Monday.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 16 * * 1", async () => {
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

  const resp = await fetch(`${url}/api/cron/ea-weekly?job=client-nudge`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return { statusCode: resp.ok ? 200 : 502, body: text.slice(0, 4096) };
});
