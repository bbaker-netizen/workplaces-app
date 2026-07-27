/**
 * Inbound triage endpoint — classifies new mail and drafts replies to
 * meeting requests. Never sends.
 *
 * Auth: Bearer `CRON_SECRET`. Called by
 * `netlify/functions/ea-inbox-sweep.mts`.
 *
 * Idempotent: `ea_email_threads` is UNIQUE on gmail_thread_id, so a
 * re-run drafts nothing on a thread already handled.
 */

import { NextResponse } from "next/server";
import { runInboxSweep } from "@/lib/ea/inbox-triage";
import { gradeSweep, withHeartbeat } from "@/lib/ea/job-runs";

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
      "ea-inbox-sweep",
      () => runInboxSweep(),
      (r) => r.drafted,
      (r) => gradeSweep({ succeeded: r.drafted + r.skipped, failed: r.failed }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/ea-inbox-sweep] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
