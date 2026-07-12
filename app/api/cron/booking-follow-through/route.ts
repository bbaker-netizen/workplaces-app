/**
 * Booking follow-through cron endpoint.
 *
 * Thin Bearer-guarded wrapper over `runBookingFollowThrough()`, which
 * finds booking rows with a due email, POSTs each to the Make "Booking
 * Follow-Through - Send" webhook, and stamps the sent timestamp on a 2xx.
 *
 * Auth: Bearer `CRON_SECRET`. Callers:
 *   - the Netlify Scheduled Function (`netlify/functions/booking-follow-through.mts`)
 *   - manual `curl -H "Authorization: Bearer …"` for verification.
 */

import { NextResponse } from "next/server";
import { runBookingFollowThrough } from "@/lib/booking/follow-through";

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

  const result = await runBookingFollowThrough();
  return NextResponse.json({ ok: true, ...result });
}
