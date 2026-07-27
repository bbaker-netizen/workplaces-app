/**
 * Morning briefing endpoint.
 *
 * Auth: Bearer `CRON_SECRET`. Two callers:
 *   - The Netlify Scheduled Function (`netlify/functions/ea-digest.mts`).
 *   - Manual `curl -H "Authorization: Bearer …"` for verification, which
 *     is also how a missed morning gets sent late.
 *
 * Why this exists rather than the Inngest function that was here first:
 * every scheduled job in this app actually runs as a Netlify Scheduled
 * Function calling a cron route. `lib/inngest/functions.ts` still
 * defines several of the same jobs, but those definitions are not what
 * fires in production — the Netlify pair is. The EA jobs were built on
 * the Inngest side alone and therefore never ran once. One scheduler,
 * and it is this one.
 *
 * Idempotent: `ea_digests` is UNIQUE on (user_profile_id, sent_for_date),
 * so calling this twice in a day sends nothing the second time.
 */

import { NextResponse } from "next/server";
import { runDailyDigest } from "@/lib/ea/digest";
import { gradeSweep, withHeartbeat } from "@/lib/ea/job-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Gathering, a calendar read, and an agenda draft per session for every
// Business Builder. Give it room before Netlify cuts it off.
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
    const result = await withHeartbeat(
      "ea-daily-digest",
      () => runDailyDigest(),
      (r) => r.sent,
      (r) => gradeSweep({ succeeded: r.sent + r.skipped, failed: r.failed }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/ea-digest] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
