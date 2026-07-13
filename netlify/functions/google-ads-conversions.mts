/**
 * Google Ads offline-conversion sync — Netlify Scheduled Function.
 *
 * Runs on a schedule and calls the Bearer-guarded Next.js route, which does the
 * real work (find prospects with a gclid that reached booked/signed and haven't
 * been uploaded, and push a ClickConversion for each). Keeping the logic in the
 * route means one place with full app/db context. Idempotent — safe to run often.
 *
 * Schedule: every 30 minutes. Offline conversions are not time-critical (Google
 * accepts them for days after the click), so a relaxed cadence is plenty.
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

  const resp = await fetch(`${url}/api/cron/google-ads-conversions`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
