/**
 * Fireflies-sync endpoint.
 *
 * Pulls every active engagement's Fireflies meeting notes (recaps,
 * summaries, recording links) into engagement_meetings so each client's
 * "Meeting notes" portal module stays current automatically — including
 * their recurring Business Building sessions (see
 * lib/actions/sync-engagement-meetings.ts → syncAllEngagementMeetings).
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
import { syncAllEngagementMeetings } from "@/lib/actions/sync-engagement-meetings";

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
    const result = await syncAllEngagementMeetings();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/fireflies-sync] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
