/**
 * Working-hours mail queue drain.
 *
 * Netlify Scheduled Function — a thin trigger onto the Next.js cron
 * route, same pattern as every other job here.
 *
 * Schedule: every 15 minutes, 14:00–23:59 UTC, Monday to Friday.
 * That covers 08:00–17:59 MDT and 07:00–16:59 MST, so
 * it is running whenever the working-hours window is open in either
 * offset and never wakes at the weekend, when nothing it sends would be
 * allowed out anyway.
 *
 * Fifteen minutes rather than hourly because the queue's whole purpose
 * is mail somebody is waiting on: an action item published at 7am should
 * reach the client shortly after 08:30, not at 9.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("*/15 14-23 * * 1-5", async () => {
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

  const resp = await fetch(`${url}/api/cron/email-outbox`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return { statusCode: resp.ok ? 200 : 502, body: text.slice(0, 4096) };
});
