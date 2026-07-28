/**
 * Session-series top-up endpoint.
 *
 * Keeps every active recurring meeting materialized ~90 days out, so a
 * touch-base defined once keeps producing instances indefinitely instead
 * of quietly running out of dates.
 *
 * Idempotent: instance creation is guarded by a UNIQUE index on
 * (series_id, series_occurrence_at), so a retry or an overlapping run
 * inserts nothing rather than double-booking every date.
 *
 * Auth: Bearer `CRON_SECRET`. Two callers:
 *   - The Netlify Scheduled Function (`netlify/functions/session-series.mts`).
 *   - Manual `curl -H "Authorization: Bearer …"` for verification.
 *
 * **Why this route exists.** `topUpAllSeries` was only ever registered as
 * an Inngest function, and Inngest is not what runs scheduled work in this
 * app — every live job is a Netlify Scheduled Function calling a route
 * under `app/api/cron`. So it had never fired, not once, and recurring
 * series were silently drifting toward the end of their materialized
 * horizon. Found on 2026-07-28 while fixing the same class of fault in
 * the Fireflies sync.
 *
 * The work itself is already cron-safe: `topUpAllSeries` runs on
 * `withSystemContext`, not `withEngagementContext`, because there is no
 * signed-in user behind a scheduled run.
 *
 * No emails or notifications are sent here, so there's no working-hours
 * guard to honour.
 */

import { NextResponse } from "next/server";
import { topUpAllSeries } from "@/lib/actions/session-series";
import { withHeartbeat } from "@/lib/ea/job-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Walks every active series and can insert a quarter of instances for
// each, so give it room beyond the default before Netlify cuts it off.
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured." },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Heartbeat, because the failure this job has already suffered once is
    // silence: a schedule that never fires throws nothing, and "no new
    // meeting instances" looks exactly like "no active series". The row it
    // writes surfaces in the Friday rollup's job table.
    const result = await withHeartbeat(
      "session-series-top-up",
      () => topUpAllSeries(),
      (r) => r.instancesCreated,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/session-series] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
