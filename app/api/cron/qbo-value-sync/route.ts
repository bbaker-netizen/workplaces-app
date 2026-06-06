/**
 * QuickBooks lifetime-value sync endpoint.
 *
 * Refreshes the cached `qbo_lifetime_payments_cents` on every engagement
 * linked to a QBO customer, so the Pipeline "Value" column reflects money
 * actually received. Cross-tenant system scan (see lib/qbo/value-sync).
 *
 * Auth: Bearer `CRON_SECRET`. Callers:
 *   - the Netlify Scheduled Function (`netlify/functions/qbo-value-sync.mts`)
 *   - manual `curl -H "Authorization: Bearer …"` for verification
 */

import { NextResponse } from "next/server";
import { syncQboLifetimeValues } from "@/lib/qbo/value-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncQboLifetimeValues();
  return NextResponse.json({ ok: true, ...result });
}
