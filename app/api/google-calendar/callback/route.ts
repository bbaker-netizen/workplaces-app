/**
 * Google Calendar OAuth callback.
 *
 * Validates the signed state (proves the request originated from /connect
 * for a specific user), exchanges the auth code for tokens, persists them
 * encrypted on the user's row, then bounces back to the profile page.
 *
 * IMPORTANT: this route does NOT rely on the Clerk session. The OAuth
 * redirect_uri points at the Netlify origin, which can differ from the
 * custom domain the user is logged into (builder.4workplaces.com) — so the
 * session cookie may not be present here at all. Instead we authenticate
 * the user purely from the HMAC-signed `state` (set in /connect): the
 * signature proves the embedded user_profile id is genuine, and we look up
 * their org from the database under system context. No session required.
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
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

/**
 * Verify the signed state and return the embedded user_profile id, or null
 * if the signature doesn't check out. Mirrors how /connect built it:
 * `<nonce>.<userProfileId>.<hmac>`.
 */
function userIdFromState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [nonce, userProfileId, sig] = parts;
  const secret =
    process.env.GOOGLE_CALENDAR_STATE_SECRET ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) return null;
  const expected = createHmac("sha256", secret)
    .update(`${nonce}.${userProfileId}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userProfileId : null;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const profilePath = "/business-builder/profile/google-calendar";

  if (errorParam) {
    return NextResponse.redirect(
      `${appUrl()}${profilePath}?error=${encodeURIComponent(errorParam)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl()}${profilePath}?error=missing_params`);
  }

  // Authenticate from the signed state — NOT the (possibly absent) session.
  const userProfileId = userIdFromState(state);
  if (!userProfileId) {
    return NextResponse.redirect(`${appUrl()}${profilePath}?error=state_mismatch`);
  }

  // Resolve the user's org (+ role gate) from the database.
  const userRow = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ orgId: userProfiles.orgId, role: userProfiles.role })
      .from(userProfiles)
      .where(eq(userProfiles.id, userProfileId))
      .limit(1);
    return row ?? null;
  });
  if (!userRow) {
    return NextResponse.redirect(`${appUrl()}${profilePath}?error=unknown_user`);
  }
  if (userRow.role !== "master_admin" && userRow.role !== "coach") {
    return NextResponse.redirect(`${appUrl()}/portal`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchGoogleEmail(tokens.accessToken);
    await storeUserTokens({
      orgId: userRow.orgId,
      userProfileId,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      scope: tokens.scope,
      googleEmail: email,
    });
    return NextResponse.redirect(`${appUrl()}${profilePath}?connected=1`);
  } catch (e) {
    console.error("[google-calendar] callback failed:", e);
    return NextResponse.redirect(
      `${appUrl()}${profilePath}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "exchange_failed",
      )}`,
    );
  }
}
