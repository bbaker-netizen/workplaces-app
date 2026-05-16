/**
 * Gmail sync trigger — pulls new client-related messages from every
 * connected user's Gmail. Netlify Scheduled Function calls the Next.js
 * cron route which does the actual work.
 *
 * Schedule: every 10 minutes around the clock. New emails should land
 * in the inbox within ~10 minutes of arrival. Cost is tiny — Gmail's
 * search-by-`after:` keeps each user's scan to just new mail.
 *
 *   `*\/10 * * * *` — every 10th minute. (Comment escaped to avoid
 *   breaking JSDoc parsing; the actual schedule string below is the
 *   plain `*\/10` form Netlify expects.)
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("*/10 * * * *", async () => {
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

  const resp = await fetch(`${url}/api/cron/gmail-sync`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
