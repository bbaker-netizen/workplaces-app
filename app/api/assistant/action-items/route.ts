/**
 * GET /api/assistant/action-items
 *
 * Read-only proxy to the AI Assistant gateway (Phase 1). Adds the gateway
 * secret server-side, runs `op:read`, and returns the open items grouped
 * by client. Never writes back to the gateway.
 *
 * Auth: coach / master_admin only — this is a Business Builder console
 * surface, not a client-facing one. Clerk middleware already gates the
 * app; this is the explicit role check on top.
 *
 * Optional query params mirror the gateway filters: ?client=, ?source=,
 * ?status= (default returns only Status=Open from the gateway).
 */

import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { readAssistantActionItems } from "@/lib/assistant/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const result = await readAssistantActionItems({
    client: url.searchParams.get("client") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
