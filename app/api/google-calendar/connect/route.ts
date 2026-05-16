/**
 * Kicks off the Google Calendar OAuth dance. Authenticated coaches /
 * master_admins only. We sign the state value with the user's Clerk id
 * so the callback can resolve back to the right user_profile without
 * trusting the URL.
 */

import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "node:crypto";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { buildAuthUrl } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function signState(payload: string): string {
  const secret = process.env.GOOGLE_CALENDAR_STATE_SECRET ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "GOOGLE_CALENDAR_STATE_SECRET (or TOKEN_ENCRYPTION_KEY) must be set.",
    );
  }
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function GET(): Promise<Response> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return NextResponse.redirect(
      new URL("/no-invitation", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return NextResponse.redirect(
      new URL("/portal", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  }

  // State carries: <nonce>.<userProfileId>.<hmac-sig> — the callback
  // verifies the sig before trusting the embedded user id.
  const nonce = randomBytes(16).toString("hex");
  const payload = `${nonce}.${profile.userProfileId}`;
  const sig = signState(payload);
  const state = `${payload}.${sig}`;

  const url = buildAuthUrl(state);
  return NextResponse.redirect(url);
}
