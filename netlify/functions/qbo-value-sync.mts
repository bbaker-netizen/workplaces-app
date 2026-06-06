/**
 * Nightly QuickBooks value sync trigger.
 *
 * Thin Netlify Scheduled Function — calls the Next.js cron route which
 * does the real work (with full app/db/auth context). Mirrors the
 * email-due-soon pattern.
 *
 * Schedule: `0 11 * * *` — 11:00 UTC daily, i.e. 04:00 MST / 05:00 MDT.
 * Runs in the quiet early morning so the day starts with fresh numbers
 * and we never compete with QBO's busy hours.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 11 * * *", async () => {
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

  const resp = await fetch(`${url}/api/cron/qbo-value-sync`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
