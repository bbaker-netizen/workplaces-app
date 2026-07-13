/**
 * Google Ads offline-conversion sync endpoint.
 *
 * Bearer-guarded wrapper over `runGoogleAdsConversionSync()`, which uploads a
 * Booked-session / Client-signed conversion for every prospect that has a gclid,
 * has reached that stage, and hasn't been uploaded yet. Idempotent + safe to run
 * repeatedly (ERP build spec 2026-07-13, item 6).
 *
 * Auth: Bearer `CRON_SECRET`. Callers: the Netlify Scheduled Function
 * (`netlify/functions/google-ads-conversions.mts`) and manual curl.
 */

import { NextResponse } from "next/server";
import { runGoogleAdsConversionSync } from "@/lib/google-ads/offline-conversions";

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

  const result = await runGoogleAdsConversionSync();
  return NextResponse.json({ ok: true, ...result });
}
