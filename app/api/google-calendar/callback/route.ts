/**
 * Google Calendar OAuth callback.
 *
 * Validates the signed state (proves the request originated from /connect
 * with our user's id), exchanges the auth code for tokens, persists them
 * encrypted on the user's row, then bounces back to the profile page.
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  exchangeCodeForTokens,
  fetchGoogleEmail,
  storeUserTokens,
} from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

function verifyState(state: string, expectedUserProfileId: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, userProfileId, sig] = parts;
  if (userProfileId !== expectedUserProfileId) return false;
  const secret = process.env.GOOGLE_CALENDAR_STATE_SECRET ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(`${nonce}.${userProfileId}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      `${appUrl()}/business-builder/profile/google-calendar?error=${encodeURIComponent(errorParam)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl()}/business-builder/profile/google-calendar?error=missing_params`,
    );
  }

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return NextResponse.redirect(`${appUrl()}/no-invitation`);
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return NextResponse.redirect(`${appUrl()}/portal`);
  }

  if (!verifyState(state, profile.userProfileId)) {
    return NextResponse.redirect(
      `${appUrl()}/business-builder/profile/google-calendar?error=state_mismatch`,
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchGoogleEmail(tokens.accessToken);
    await storeUserTokens({
      orgId: profile.orgId,
      userProfileId: profile.userProfileId,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      scope: tokens.scope,
      googleEmail: email,
    });
    return NextResponse.redirect(
      `${appUrl()}/business-builder/profile/google-calendar?connected=1`,
    );
  } catch (e) {
    console.error("[google-calendar] callback failed:", e);
    return NextResponse.redirect(
      `${appUrl()}/business-builder/profile/google-calendar?error=${encodeURIComponent(
        e instanceof Error ? e.message : "exchange_failed",
      )}`,
    );
  }
}
