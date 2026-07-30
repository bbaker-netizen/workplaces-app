/**
 * Fireflies-sync endpoint.
 *
 * Pulls every active engagement's Fireflies meeting notes (recaps,
 * summaries, recording links) into engagement_meetings so each client's
 * "Meeting notes" portal module stays current automatically — including
 * their recurring Business Building sessions (see
 * lib/integrations/fireflies-sync.ts → syncAllEngagementMeetingsAsSystem).
 * Idempotent (UNIQUE on engagement_id + transcript_id), so it's safe to
 * run as often as the schedule fires.
 *
 * Auth: Bearer `CRON_SECRET`. Two callers:
 *   - The Netlify Scheduled Function (`netlify/functions/fireflies-sync.mts`).
 *   - Manual `curl -H "Authorization: Bearer …"` for verification.
 *
 * No emails or notifications are sent here, so there's no working-hours
 * guard to honour.
 */

import { NextResponse } from "next/server";
// The AsSystem variant, NOT the `lib/actions` one. That one guards on
// `ensureUserProfile()`, which reads the Clerk session — a cron has none,
// so it returned "0 engagements" in milliseconds every hour and recaps
// never arrived. See the header of lib/integrations/fireflies-sync.ts.
import { syncAllEngagementMeetingsAsSystem } from "@/lib/integrations/fireflies-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Fireflies detail fetches are sequential across every engagement, so give
// the route room beyond the default before Netlify cuts it off.
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
    const result = await syncAllEngagementMeetingsAsSystem();

    // EA: pair transcripts to their sessions and draft any missing
    // recaps. Rides this job because it must run AFTER the meetings sync
    // above has refreshed the data it matches against, which is what
    // makes "within an hour of the transcript landing" true without a
    // second schedule.
    //
    // A separate try/catch: a recap failure must not fail the meetings
    // sync, which is the part clients see in their portal.
    let recaps: unknown = null;
    try {
      const { runRecapSweep } = await import("@/lib/ea/recap-sweep");
      const { gradeSweep, withHeartbeat } = await import("@/lib/ea/job-runs");
      recaps = await withHeartbeat(
        "ea-recap-sweep",
        () => runRecapSweep(),
        (r) => r.drafted,
        (r) => {
          // A skip is counted as a success here because "no transcript
          // yet" is the ordinary state of most sessions. But that makes
          // a sweep which skipped EVERYTHING for a real reason grade
          // clean, and a clean grade stores no error text — hiding the
          // exact fault this reporting exists to expose. A recorded
          // reason downgrades the run to partial so it survives.
          const base = gradeSweep({
            succeeded: r.drafted + r.skipped,
            failed: r.failed,
          });
          return base === "success" && r.firstError ? "partial" : base;
        },
        (r) => r.firstError,
      );
    } catch (e) {
      console.error("[cron/fireflies-sync] EA recap sweep failed:", e);
      recaps = { error: e instanceof Error ? e.message : String(e) };
    }

    return NextResponse.json({ ok: true, ...result, recaps });
  } catch (e) {
    console.error("[cron/fireflies-sync] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
