"use server";

/**
 * QuickBooks Online — server actions.
 *
 * Phase 4.6. Surface:
 *   - `startQboAuthorize()` — generates a CSRF state, sets a cookie,
 *     and returns the Intuit authorize URL the coach should be sent to.
 *   - `disconnectQbo()` — revoke + drop stored tokens.
 *   - `createQboInvoiceForEngagement(...)` — provider-aware wrapper
 *     in lib/actions/invoices.ts uses this.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { qboOauthTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { qboAuthorizeUrl, revokeQboTokens } from "@/lib/integrations/qbo";
import { decryptSecret } from "@/lib/crypto/secret-vault";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function startQboAuthorize(): Promise<
  ActionResult<{ authorizeUrl: string }>
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Coaches only." };

  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REDIRECT_URI) {
    return {
      ok: false,
      error:
        "QuickBooks isn't configured yet. Bruce needs to add QBO_CLIENT_ID and QBO_REDIRECT_URI to Netlify.",
    };
  }

  const state = randomBytes(24).toString("base64url");
  cookies().set("qbo_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 min
    path: "/",
  });

  return {
    ok: true,
    data: { authorizeUrl: qboAuthorizeUrl(state) },
  };
}

export async function disconnectQbo(): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Coaches only." };

  const stored = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ refreshToken: qboOauthTokens.refreshToken })
      .from(qboOauthTokens)
      .where(eq(qboOauthTokens.coachUserProfileId, profile.userProfileId))
      .limit(1);
    return row ?? null;
  });

  if (stored) {
    try {
      await revokeQboTokens(decryptSecret(stored.refreshToken));
    } catch (e) {
      console.warn("[qbo-disconnect] revoke failed (non-fatal):", e);
    }
    await withSystemContext(async (tx) => {
      await tx
        .delete(qboOauthTokens)
        .where(
          eq(qboOauthTokens.coachUserProfileId, profile.userProfileId),
        );
    });
  }

  revalidatePath("/coach/profile/quickbooks");
  return { ok: true, data: undefined };
}
