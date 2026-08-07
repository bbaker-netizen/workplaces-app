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
import {
  GOOGLE_CALENDAR_SCOPE,
  getValidAccessToken,
} from "@/lib/integrations/google-calendar";
import {
  assessCapabilities,
  isRecoverableByReconnect,
  normalizeScopes,
  type CapabilityStatus,
} from "@/lib/integrations/google-scopes";

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
  /** Scope recorded at exchange time, straight from our column. */
  storedScope?: string | null;
  /** Required capabilities that grant does not cover. */
  missing?: CapabilityStatus[];
  capabilities?: CapabilityStatus[];
  /**
   * A real call to Google with the CACHED token, then — if refused — a
   * second with a force-refreshed one, which separates a stale token
   * from a grant problem. `events` is the call the app actually makes;
   * `calendarList` is a control the app never uses, kept only so its
   * expected 403 is never mistaken for the fault again.
   */
  probe?: {
    events: { ok: boolean; status?: number; message?: string };
    eventsAfterForceRefresh?: { ok: boolean; status?: number; message?: string };
    calendarListControl?: { ok: boolean; status?: number; message?: string };
    liveScope?: string;
    audience?: string;
    scopeMatchesStored?: boolean;
    verdict: string;
    /** True only when reconnecting can actually change the outcome. */
    reconnectWouldHelp: boolean;
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

async function get(
  url: string,
  token: string,
): Promise<{ ok: boolean; status?: number; message?: string }> {
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: text.slice(0, 400) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The call the app ACTUALLY makes.
 *
 * The first version of this probe used `calendarList.list` because it
 * was the cheapest authenticated call to hand. That was a mistake worth
 * recording: `calendar.events` — the scope we request and hold — does
 * not authorize calendarList, so the probe returned 403 "insufficient
 * authentication scopes" on a connection whose real calls might be
 * perfectly fine, and sent the diagnosis down a false trail. A probe
 * must exercise the failing capability, not a nearby one.
 *
 * `listExternalEvents` calls events.list against a known calendar id;
 * so does everything else in this codebase (there is no freebusy or
 * calendarList caller anywhere). This mirrors it exactly, with a
 * one-hour window and a single result so it costs nothing.
 */
async function probeEventsList(
  token: string,
  calendarId: string,
): Promise<{ ok: boolean; status?: number; message?: string }> {
  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 3_600_000).toISOString(),
    singleEvents: "true",
    maxResults: "1",
  });
  return get(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events?${params.toString()}`,
    token,
  );
}

/**
 * What Google says the token carries, which beats what we stored.
 *
 * `google_calendar_tokens.scope` records what came back at exchange
 * time; tokeninfo reports what is on the bearer token being sent right
 * now, plus its audience. If those two ever disagree — a token minted
 * under a different OAuth client, say — no amount of reading our own
 * column would show it.
 */
async function tokenInfo(token: string): Promise<{
  ok: boolean;
  scope?: string;
  audience?: string;
  expiresIn?: string;
  message?: string;
}> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (!res.ok)
      return { ok: false, message: JSON.stringify(body).slice(0, 300) };
    return {
      ok: true,
      scope: body.scope,
      audience: body.aud,
      expiresIn: body.expires_in,
    };
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
    scope: string | null;
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
          scope: googleCalendarTokens.scope,
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

  const capabilities = assessCapabilities(row.scope);
  const missing = capabilities.filter((c) => c.required && !c.granted);

  const base: GoogleCredentialDiagnostic = {
    connected: true,
    googleEmail: row.googleEmail,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    connectedAt: row.createdAt,
    accessToken: access,
    refreshToken: refresh,
    storedScope: row.scope,
    capabilities,
    missing,
  };
  if (!opts.probe) return base;

  const call = async (force: boolean) => {
    const t = await getValidAccessToken(userProfileId, { forceRefresh: force });
    if (!t) return null;
    return t;
  };

  let events: { ok: boolean; status?: number; message?: string };
  let live: Awaited<ReturnType<typeof tokenInfo>> | null = null;
  let control: { ok: boolean; status?: number; message?: string } | undefined;
  try {
    const t = await call(false);
    if (!t) {
      events = { ok: false, message: "No usable access token could be produced." };
    } else {
      events = await probeEventsList(t.token, t.calendarId);
      live = await tokenInfo(t.token);
      control = await get(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
        t.token,
      );
    }
  } catch (e) {
    events = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  const shared = {
    calendarListControl: control,
    liveScope: live?.scope,
    audience: live?.audience,
    // Our column records the grant at exchange time; tokeninfo reports
    // what the bearer token carries now. Disagreement would mean the
    // token came from somewhere other than the grant we recorded.
    scopeMatchesStored:
      live?.scope != null && row.scope != null
        ? new Set(normalizeScopes(live.scope)).size ===
            new Set(normalizeScopes(row.scope)).size &&
          normalizeScopes(live.scope).every((s) =>
            new Set(normalizeScopes(row.scope)).has(s),
          )
        : undefined,
  };

  if (events.ok) {
    return {
      ...base,
      probe: {
        events,
        ...shared,
        reconnectWouldHelp: false,
        verdict:
          "Google accepts the call this app actually makes (events.list). Reading the calendar works.",
      },
    };
  }

  // Refused. A brand-new token separates a stale one from a grant fault.
  let fresh: { ok: boolean; status?: number; message?: string };
  try {
    const t = await call(true);
    fresh = t
      ? await probeEventsList(t.token, t.calendarId)
      : { ok: false, message: "Refresh produced no access token." };
  } catch (e) {
    fresh = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  const recoverable = isRecoverableByReconnect(missing, GOOGLE_CALENDAR_SCOPE);
  let verdict: string;
  let reconnectWouldHelp = false;

  if (fresh.ok) {
    verdict =
      "The stored access token was stale; a refreshed one works. The grant and its scopes are fine.";
  } else if (!access.decrypts || !refresh.decrypts) {
    verdict =
      "Stored credentials will not decrypt — TOKEN_ENCRYPTION_KEY no longer matches what encrypted them. Reconnecting will not help until the key is restored.";
  } else if (access.storage === "plaintext-passthrough") {
    verdict =
      "The stored access token was never encrypted, so it is sent to Google verbatim. Reconnect to write a proper one.";
    reconnectWouldHelp = true;
  } else if (missing.length > 0 && recoverable) {
    verdict = `The grant is missing ${missing
      .map((m) => m.label)
      .join(", ")}. We DO ask for it, so it was declined on the consent screen — reconnect and leave every permission ticked.`;
    reconnectWouldHelp = true;
  } else if (missing.length > 0) {
    verdict = `The grant is missing ${missing
      .map((m) => m.label)
      .join(
        ", ",
      )}, and we never ask for it. RECONNECTING WILL NOT HELP — the requested scope list has to be fixed and deployed first.`;
  } else if (fresh.status === 403) {
    verdict =
      "Every scope this app needs is granted, and a freshly refreshed token is still refused with 403. That is a Google project or API-enablement problem, not a consent one — reconnecting will not change it.";
  } else {
    verdict = `Credentials are well formed and every required scope is granted, yet events.list is refused (${
      fresh.status ?? "no status"
    }). Not a scope problem; do not reconnect on the strength of this.`;
  }

  return {
    ...base,
    probe: {
      events,
      eventsAfterForceRefresh: fresh,
      ...shared,
      verdict,
      reconnectWouldHelp,
    },
  };
}
