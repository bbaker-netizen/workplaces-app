/**
 * The two weekly EA jobs, behind one endpoint selected by `?job=`.
 *
 *   ?job=client-nudge  — Monday chase to clients about what they owe.
 *   ?job=friday-rollup — Friday summary to each Business Builder.
 *
 * One route rather than two because they are the same shape and differ
 * only in which function they call; two Netlify Scheduled Functions
 * still call it on their own schedules.
 *
 * Auth: Bearer `CRON_SECRET`.
 *
 * Note on repeat runs: unlike the digest and the triage sweep, neither
 * of these has a database-level idempotency key — they send mail rather
 * than writing a row that could carry a UNIQUE constraint. Calling this
 * twice in a day WILL send twice. The client nudge writes a notification
 * guarded against repeating inside three days, but the emails are not
 * guarded. Trigger manually with that in mind.
 */

import { NextResponse } from "next/server";
import { runClientNudge } from "@/lib/ea/client-nudge";
import { runFridayRollup } from "@/lib/ea/friday-rollup";
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

  const job = new URL(req.url).searchParams.get("job");

  try {
    if (job === "client-nudge") {
      const result = await withHeartbeat(
        "ea-client-nudge",
        () => runClientNudge(),
        (r) => r.itemsChased,
        (r) => gradeSweep({ succeeded: r.recipientsEmailed, failed: r.failed }),
      );
      return NextResponse.json({ ok: true, job, ...result });
    }

    if (job === "friday-rollup") {
      const result = await withHeartbeat(
        "ea-friday-rollup",
        () => runFridayRollup(),
        (r) => r.sent,
        (r) => gradeSweep({ succeeded: r.sent, failed: r.failed }),
      );
      return NextResponse.json({ ok: true, job, ...result });
    }

    return NextResponse.json(
      { ok: false, error: "Pass ?job=client-nudge or ?job=friday-rollup." },
      { status: 400 },
    );
  } catch (e) {
    console.error(`[cron/ea-weekly] ${job} failed:`, e);
    return NextResponse.json(
      { ok: false, job, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
