/**
 * Gmail sync trigger — pulls new client-related messages from every
 * connected user's Gmail. Netlify Scheduled Function calls the Next.js
 * cron route which does the actual work.
 *
 * Schedule: `*\/30 14-23 * * 1-5` — every 30 minutes, but only Mon–Fri
 * during Bruce's working window (14:00–23:59 UTC ≈ 8am–6pm MST / 7am–5pm
 * MDT). Outside that window the DB gets no traffic and Neon scales to
 * zero, which is what keeps the compute bill down. New emails surface
 * within ~30 min during the workday; overnight mail lands the next
 * morning. (The star-slash is escaped `*\/30` so it doesn't close this
 * JSDoc block early — same gotcha noted in `calendar-sync.mts`.)
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("*/30 14-23 * * 1-5", async () => {
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
