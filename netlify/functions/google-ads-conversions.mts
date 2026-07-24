/**
 * Google Ads offline-conversion sync — Netlify Scheduled Function.
 *
 * Runs on a schedule and calls the Bearer-guarded Next.js route, which does the
 * real work (find prospects with a gclid that reached booked/signed and haven't
 * been uploaded, and push a ClickConversion for each). Keeping the logic in the
 * route means one place with full app/db context. Idempotent — safe to run often.
 *
 * Schedule: `0 15,21 * * 1-5` — twice a day (15:00 and 21:00 UTC, Mon–Fri
 * ≈ 8am/9am and 2pm/3pm MT). Offline conversions are not time-critical
 * (Google accepts them for days after the click), so twice-daily is plenty
 * — and dropping the round-the-clock cadence lets Neon scale to zero the
 * rest of the time, which is what keeps the compute bill down. Both runs
 * land inside the daytime window the other syncs already use, so they add
 * no extra database wake-ups.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 15,21 * * 1-5", async () => {
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
