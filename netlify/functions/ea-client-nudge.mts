/**
 * Weekly client-chase trigger.
 *
 * Netlify Scheduled Function — a thin trigger that calls the Next.js
 * cron route, where the real work lives. Mirrors `ea-friday-rollup.mts`,
 * which calls the same route with the other `?job=` value.
 *
 * Schedule: `0 16 * * 1` — Monday 16:00 UTC, which is 10:00 MDT /
 * 09:00 MST. Start of the week, inside the working window either way,
 * and the emails it sends go through the normal working-hours guard.
 *
 * **Why this file exists.** The `ea-weekly` route has always handled two
 * jobs — `?job=client-nudge` and `?job=friday-rollup` — but only the
 * rollup ever got a trigger. So the Monday client chase had no caller at
 * all and had never run once since the EA module shipped; the heartbeat
 * table recorded it as NEVER RUN on 2026-07-29, which is how it was
 * found. Third instance of a job existing in code with nothing scheduled
 * to call it, after the EA jobs themselves and the session-series
 * top-up.
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
