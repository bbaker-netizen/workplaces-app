/**
 * Send the mail the working-hours guard held back.
 *
 * `sendEmail` refuses anything outside Mon–Fri 08:30–18:00 Mountain. It
 * always returned a `nextSendAt` and nothing ever consumed it, so the
 * message was dropped — silently, because `sendEmailQuietly` only logs
 * the `error` case. Publish an action item at 6:30pm, or release a
 * transcript at the weekend, and the client was never told at all.
 * Migration 0117 added the queue; this drains it.
 *
 * Auth: Bearer `CRON_SECRET`, same as every other job here.
 *
 * The heartbeat matters more than usual. This job's only failure mode is
 * silence twice over — mail that never arrives, from a queue nobody
 * watches — so it reports through `ea_job_runs` and turns red in the
 * Friday rollup after 8 days without a successful run.
 */

import { NextResponse } from "next/server";
import { flushEmailOutbox } from "@/lib/email/outbox";
import { withHeartbeat } from "@/lib/ea/job-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
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
      "email-outbox",
      () => flushEmailOutbox(),
      (r) => r.sent,
      // The sweep carries on past a bad address so one dead recipient
      // can't block the mail behind it — which means a run with failures
      // returns normally and would otherwise grade clean. Downgrade it
      // so the failure survives into the Friday rollup's job table.
      (r) => (r.failed > 0 || r.abandoned > 0 ? "partial" : "success"),
      (r) => r.firstError,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/email-outbox] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
