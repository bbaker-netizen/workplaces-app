/**
 * Inbound triage trigger — drafts replies to meeting requests.
 *
 * Schedule: `15 13-23 * * *` — quarter past each hour, EVERY day,
 * across 13:00–23:59 UTC (roughly 07:00–17:00 MDT).
 *
 * Seven days, unlike the weekday-only jobs, because this one sends
 * nothing: it writes a draft into Gmail. A prospect asking for time on
 * Saturday morning otherwise waits until Monday, and response speed is
 * what decides whether that meeting happens.
 *
 * Daytime only, though, for the same reason `fireflies-sync` is
 * restricted: an hourly job round the clock keeps the database awake
 * overnight, and that is what drives the compute bill. Nobody emails at
 * 3am expecting a reply by 4am.
 *
 * The twelve-hour lookback in the sweep itself means the overnight gap
 * costs nothing — the first run of the morning still sees everything
 * that arrived while it was quiet.
 */

import { schedule } from "@netlify/functions";

export const handler = schedule("15 13-23 * * *", async () => {
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

  const resp = await fetch(`${url}/api/cron/ea-inbox-sweep`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await resp.text();
  return { statusCode: resp.ok ? 200 : 502, body: text.slice(0, 4096) };
});
