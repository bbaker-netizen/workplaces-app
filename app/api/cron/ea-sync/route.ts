/**
 * EA-sync cron endpoint (Stage 2 — mirror back).
 *
 * Pulls the EA Action Items sheet and brings each Builder action item that
 * carries an ea_external_id into line with the sheet's status (e.g. marking
 * it Done in Command Central flips the Builder copy to done). The real work
 * lives in `mirrorEaStatusesToBuilder`.
 *
 * Auth: Bearer `CRON_SECRET`. Two callers:
 *   - The Netlify Scheduled Function (`netlify/functions/ea-sync.mts`).
 *   - Manual `curl -H "Authorization: Bearer …"` for verification.
 *
 * Read + status-update only; sends no email or notification, so there's no
 * working-hours guard to honour.
 */

import { NextResponse } from "next/server";
import { mirrorEaStatusesToBuilder } from "@/lib/assistant/ea-sync";

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
    const result = await mirrorEaStatusesToBuilder();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/ea-sync] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
