/**
 * Why Google is rejecting us — answered from production, in production.
 *
 * Deliberately NOT `"use server"`: these functions read decrypted
 * credential material and probe a third-party API on a Builder's behalf.
 * Every export of a `"use server"` module becomes a browser-reachable
 * POST endpoint, and this must not be one. Same rule as
 * `lib/integrations/fireflies-sync.ts`.
 *
 * NOTHING here returns secret material. Token *shape* — a public prefix
 * like `ya29.`, a length, whether it decrypts — is reported; the token
 * itself never leaves this module. That distinction is the whole reason
 * this can be rendered on a console page at all.
 *
 * The check exists because three very different faults present
 * identically as a 401:
 *
 *  - `TOKEN_ENCRYPTION_KEY` rotated, so stored ciphertext no longer
 *    decrypts. GCM makes this LOUD (it throws) rather than silent, so it
 *    would surface here as `decrypts: false`.
 *  - A stored value that was never encrypted. `decryptSecret` passes
 *    anything without the `v1:` prefix through UNCHANGED as "legacy
 *    plaintext", so a junk value is forwarded to Google verbatim and
 *    comes back 401. That path is silent by construction, which is
 *    exactly why it is reported explicitly below.
 *  - A genuinely dead or under-scoped grant, where the credentials are
 *    handled perfectly and Google still says no.
 *
 * Only the last one is fixed by reconnecting, so guessing between them
 * wastes a reconnect and leaves the page dark.
 */

import { eq } from "drizzle-orm";
import { googleCalendarTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { decryptSecret, isEncrypted } from "@/lib/crypto/secret-vault";
import { getValidAccessToken } from "@/lib/integrations/google-calendar";

export type StoredTokenShape = {
  /** How it sits in the database, before any decryption. */
  storage: "encrypted-v1" | "plaintext-passthrough" | "missing";
  /** Did decryption work? False here means the key no longer matches. */
  decrypts: boolean;
  decryptError?: string;
  /** Length of the DECRYPTED value. Not secret; a truncated or empty
   *  token is obvious from this alone. */
  plaintextLength?: number;
  /**
   * Google access tokens begin `ya29.`, refresh tokens `1//`. Both
   * prefixes are public, documented and identical for every user on
   * earth, so reporting them discloses nothing while telling us
   * instantly whether what we are sending is even the right KIND of
   * string.
   */
  looksLikeGoogleToken: boolean;
};

export type GoogleCredentialDiagnostic = {
  connected: boolean;
  googleEmail: string | null;
  accessTokenExpiresAt: Date | null;
  connectedAt: Date | null;
  accessToken?: StoredTokenShape;
  refreshToken?: StoredTokenShape;
  /**
   * A real call to Google with the CACHED token, then — if that is
   * refused — a second with a force-refreshed one. Two 401s in a row
   * means the fault is the grant itself, not a stale token, and that is
   * the distinction that decides whether reconnecting will help.
   */
  probe?: {
    cached: { ok: boolean; status?: number; message?: string };
    afterForceRefresh?: { ok: boolean; status?: number; message?: string };
    verdict: string;
  };
};

function describeStored(
  value: string | null | undefined,
  kind: "access" | "refresh",
): StoredTokenShape {
  if (!value) return { storage: "missing", decrypts: false, looksLikeGoogleToken: false };
  const storage = isEncrypted(value)
    ? ("encrypted-v1" as const)
    : ("plaintext-passthrough" as const);
  try {
    const plain = decryptSecret(value);
    return {
      storage,
      decrypts: true,
      plaintextLength: plain.length,
      looksLikeGoogleToken:
        kind === "access" ? plain.startsWith("ya29.") : plain.startsWith("1//"),
    };
  } catch (e) {
    return {
      storage,
      decrypts: false,
      decryptError: e instanceof Error ? e.message : String(e),
      looksLikeGoogleToken: false,
    };
  }
}

async function callGoogle(
  token: string,
): Promise<{ ok: boolean; status?: number; message?: string }> {
  try {
    // The cheapest authenticated Calendar call there is: one entry from
    // the calendar list. Enough to prove the Authorization header is
    // accepted without reading anyone's schedule.
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: text.slice(0, 400) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Full diagnosis for one Builder. Never throws — a broken diagnostic
 * must not break the page that renders it.
 */
export async function diagnoseGoogleCredentials(
  userProfileId: string,
  opts: { probe?: boolean } = {},
): Promise<GoogleCredentialDiagnostic> {
  let row: {
    accessTokenEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    googleEmail: string | null;
    accessTokenExpiresAt: Date | null;
    createdAt: Date;
  } | null = null;

  try {
    row = await withSystemContext(async (tx) => {
      const [r] = await tx
        .select({
          accessTokenEncrypted: googleCalendarTokens.accessTokenEncrypted,
          refreshTokenEncrypted: googleCalendarTokens.refreshTokenEncrypted,
          googleEmail: googleCalendarTokens.googleEmail,
          accessTokenExpiresAt: googleCalendarTokens.accessTokenExpiresAt,
          createdAt: googleCalendarTokens.createdAt,
        })
        .from(googleCalendarTokens)
        .where(eq(googleCalendarTokens.userProfileId, userProfileId))
        .limit(1);
      return r ?? null;
    });
  } catch (e) {
    console.error("[google-diagnostics] token row read failed:", e);
  }

  if (!row) {
    return {
      connected: false,
      googleEmail: null,
      accessTokenExpiresAt: null,
      connectedAt: null,
    };
  }

  const access = describeStored(row.accessTokenEncrypted, "access");
  const refresh = describeStored(row.refreshTokenEncrypted, "refresh");

  const base: GoogleCredentialDiagnostic = {
    connected: true,
    googleEmail: row.googleEmail,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    connectedAt: row.createdAt,
    accessToken: access,
    refreshToken: refresh,
  };
  if (!opts.probe) return base;

  // Probe with whatever the app would actually send.
  let cached: { ok: boolean; status?: number; message?: string };
  try {
    const t = await getValidAccessToken(userProfileId);
    cached = t
      ? await callGoogle(t.token)
      : { ok: false, message: "No usable access token could be produced." };
  } catch (e) {
    cached = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  if (cached.ok) {
    return { ...base, probe: { cached, verdict: "Google accepts our credentials." } };
  }

  // Refused. Force a brand-new token and try once more — that separates
  // "the stored token went stale" from "the grant is dead".
  let fresh: { ok: boolean; status?: number; message?: string };
  try {
    const t = await getValidAccessToken(userProfileId, { forceRefresh: true });
    fresh = t
      ? await callGoogle(t.token)
      : { ok: false, message: "Refresh produced no access token." };
  } catch (e) {
    fresh = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  let verdict: string;
  if (fresh.ok) {
    verdict =
      "The stored access token was stale but refreshing fixed it — the grant is fine.";
  } else if (!access.decrypts || !refresh.decrypts) {
    verdict =
      "Stored credentials will not decrypt. TOKEN_ENCRYPTION_KEY no longer matches what encrypted them.";
  } else if (access.storage === "plaintext-passthrough") {
    verdict =
      "The stored access token was never encrypted, so it is being sent to Google verbatim. Reconnect to write a proper one.";
  } else {
    verdict =
      "Credentials decrypt cleanly and are well formed, and a freshly refreshed token is still refused. The grant itself is being rejected — reconnect Google.";
  }
  return { ...base, probe: { cached, afterForceRefresh: fresh, verdict } };
}
