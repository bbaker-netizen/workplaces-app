/**
 * Friday rollup trigger.
 *
 * Schedule: `0 22 * * 5` — Friday 22:00 UTC, which is 16:00 MDT /
 * 15:00 MST. Late enough that the week is done, early enough that it is
 * still Friday, and inside the working window either way.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 22 * * 5", async () => {
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

  const resp = await fetch(`${url}/api/cron/ea-weekly?job=friday-rollup`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return { statusCode: resp.ok ? 200 : 502, body: text.slice(0, 4096) };
});
