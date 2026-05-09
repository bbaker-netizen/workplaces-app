/**
 * Daily due-soon email trigger.
 *
 * Netlify Scheduled Function — runs once a day on a fixed cron, calls
 * the Next.js cron route which does the actual work. Keeping the logic
 * inside the Next.js route (with full app/db/auth context) and using
 * the scheduled function only as a thin trigger means we get one place
 * to maintain the business rule.
 *
 * Schedule: `0 16 * * 1-5` — 16:00 UTC, Mon–Fri. That maps to:
 *   - 09:00 MST (winter, UTC−7) — Bruce: 8:30am–6:00pm ⇒ inside window
 *   - 10:00 MDT (summer, UTC−6) — also inside window
 *
 * Picking 16:00 UTC keeps us comfortably inside the working window
 * year-round without DST math. We don't need minute-level precision
 * for "due tomorrow" nudges.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("0 16 * * 1-5", async () => {
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

  const resp = await fetch(`${url}/api/cron/email-due-soon`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return {
    statusCode: resp.ok ? 200 : 502,
    body: text.slice(0, 4096),
  };
});
