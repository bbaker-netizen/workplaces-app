/**
 * Follow-up-due reminder endpoint.
 *
 * Thin Bearer-guarded wrapper over the shared `scanFollowupsDue()` scan.
 * Finds OPEN prospects whose scheduled follow-up date has arrived (due today
 * in Mountain Time, or overdue) and notifies the owner — which surfaces in
 * the bell, as an in-app toast, and (when enabled) desktop push. Fills the
 * gap where scheduling a follow-up set a date but never reminded anyone.
 *
 * Auth: Bearer `CRON_SECRET`. Callers:
 *   - the Netlify Scheduled Function (`netlify/functions/followups-due.mts`)
 *   - manual `curl -H "Authorization: Bearer …"` for verification.
 */

import { NextResponse } from "next/server";
import { scanFollowupsDue } from "@/lib/notifications/followups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const result = await scanFollowupsDue();
  return NextResponse.json({ ok: true, ...result });
}
