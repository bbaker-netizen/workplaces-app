/**
 * Calendar-sync endpoint.
 *
 * Pulls every connected Business Builder's upcoming Google Calendar
 * events into BBS sessions for the matching engagement (see
 * lib/calendar/sync.ts). Idempotent — safe to run as often as the
 * schedule fires.
 *
 * Auth: Bearer `CRON_SECRET`. Two callers:
 *   - The Netlify Scheduled Function (`netlify/functions/calendar-sync.mts`).
 *   - Manual `curl -H "Authorization: Bearer …"` for verification.
 *
 * This runs alongside the Inngest `calendarSync` function (same body via
 * `syncAllConnectedCalendars`) — whichever scheduler is wired in a given
 * environment drives it; both are idempotent so running both is harmless.
 * No emails or notifications are sent here, so there's no working-hours
 * guard to honour.
 */

import { NextResponse } from "next/server";
import { syncAllConnectedCalendars } from "@/lib/calendar/sync";

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

  try {
    const result = await syncAllConnectedCalendars();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/calendar-sync] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
