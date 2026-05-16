/**
 * Gmail sync cron — pulls new client-related Gmail messages for every
 * user with the integration enabled. Designed to run every 10 minutes
 * via a Netlify Scheduled Function (or any external scheduler hitting
 * this endpoint with the bearer token).
 *
 * Auth: shared CRON_SECRET in the Authorization: Bearer <token> header.
 */

import { NextResponse } from "next/server";
import { syncAllUsers } from "@/lib/integrations/gmail-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Server not configured." },
      { status: 500 },
    );
  }
  const got = req.headers.get("authorization") ?? "";
  if (got !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const summaries = await syncAllUsers();
  return NextResponse.json({
    ok: true,
    syncedUsers: summaries.length,
    totalScanned: summaries.reduce((s, x) => s + x.scanned, 0),
    totalCaptured: summaries.reduce((s, x) => s + x.captured, 0),
    summaries,
  });
}
