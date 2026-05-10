/**
 * QBO OAuth callback.
 *
 * Phase 4.6. Intuit redirects here after the coach approves the
 * connection. Query string contains `code`, `state`, and `realmId`.
 *
 * We:
 *   1. Verify the state matches the one we set in a cookie at
 *      authorize-start time (CSRF protection).
 *   2. Exchange the code for an access + refresh token.
 *   3. Look up which coach this is via the user_profile referenced
 *      in the state, and persist the tokens in qbo_oauth_tokens.
 *   4. Redirect back to /coach/profile/quickbooks.
 */

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { qboOauthTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { exchangeAuthCode } from "@/lib/integrations/qbo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToProfile(`error=${encodeURIComponent(error)}`);
  }
  if (!code || !state || !realmId) {
    return redirectToProfile("error=missing_params");
  }

  // CSRF: state in URL must match the cookie we set at authorize-start.
  const cookieStore = cookies();
  const expected = cookieStore.get("qbo_oauth_state")?.value;
  if (!expected || expected !== state) {
    return redirectToProfile("error=state_mismatch");
  }

  // Coach must be authed in this same browser session (the cookie
  // ride-along guarantees that by the time we get here Clerk is
  // present too).
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return redirectToProfile("error=not_authenticated");
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return redirectToProfile("error=not_a_coach");
  }

  let tokens;
  try {
    tokens = await exchangeAuthCode(code);
  } catch (e) {
    console.error("[qbo-callback] token exchange failed:", e);
    return redirectToProfile(
      `error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`,
    );
  }

  await withSystemContext(async (tx) => {
    const [existing] = await tx
      .select({ id: qboOauthTokens.id })
      .from(qboOauthTokens)
      .where(eq(qboOauthTokens.coachUserProfileId, profile.userProfileId))
      .limit(1);
    if (existing) {
      await tx
        .update(qboOauthTokens)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          realmId,
          expiresAt: tokens.expiresAt,
          refreshExpiresAt: tokens.refreshExpiresAt,
        })
        .where(eq(qboOauthTokens.id, existing.id));
    } else {
      await tx.insert(qboOauthTokens).values({
        coachUserProfileId: profile.userProfileId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        realmId,
        expiresAt: tokens.expiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      });
    }
  });

  // Clear the state cookie.
  cookieStore.delete("qbo_oauth_state");

  return redirectToProfile("connected=1");
}

function redirectToProfile(query: string): Response {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(
    `${base}/coach/profile/quickbooks?${query}`,
  );
}
