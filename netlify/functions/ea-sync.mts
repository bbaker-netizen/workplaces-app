/**
 * Periodic EA-sheet -> Builder status mirror trigger.
 *
 * Netlify Scheduled Function — a thin trigger that calls the Next.js cron
 * route, where the real work lives (full app/db context). Mirrors the
 * `fireflies-sync` setup so there's one pattern to maintain.
 *
 * Schedule: every 15 minutes. The Builder already pushes its own changes
 * out instantly; this is the reverse leg, bringing status changes Bruce
 * makes in Command Central back to the Builder. Fifteen minutes keeps the
 * two copies in step without hammering the sheet. The job only reads the
 * sheet and updates statuses; it sends no email or notification, so there's
 * no working-hours window to respect.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("*/15 * * * *", async () => {
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

  const resp = await fetch(`${url}/api/cron/ea-sync`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
