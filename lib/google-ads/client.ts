/**
 * Minimal REST client for offline conversion imports via Google's **Data Manager
 * API** (`datamanager.googleapis.com/v1/events:ingest`).
 *
 * Why Data Manager and not the Google Ads API: as of 2026-06-15 Google blocks
 * `ConversionUploadService.UploadClickConversions` for developer tokens that
 * hadn't already used it — new integrations must use the Data Manager API
 * instead (error CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE). Same OAuth client,
 * same conversion actions; different endpoint, a dedicated `datamanager` scope,
 * and NO developer token required.
 *
 * No SDK — a couple of fetches keep the dependency surface (and the bundle)
 * small. Every function is defensive: transient failures are retried with
 * backoff, and the raw Google response is returned verbatim on failure so the
 * caller can log it (never swallowed). ERP build spec 2026-07-13, item 6.
 */

import type { GoogleAdsConfig } from "@/lib/google-ads/config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";

export interface ClickConversionInput {
  gclid: string;
  /** Resource name (`customers/{cid}/conversionActions/{id}`) or bare numeric id
   *  of the conversion action. Only the numeric id is sent to Data Manager. */
  conversionAction: string;
  /** RFC 3339, e.g. "2026-07-13T15:45:00-06:00". */
  conversionDateTime: string;
  /** Optional conversion value + ISO currency. */
  value?: number;
  currencyCode?: string;
}

export interface UploadResult {
  ok: boolean;
  /** HTTP status, or 0 on a network error. */
  status: number;
  /** Verbatim response body (or error message) for logging. */
  body: string;
}

/** Sleep helper for backoff (no external dep). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Data Manager wants the bare numeric conversion-action id (not the resource
 *  name). Accepts either form. */
export function conversionActionId(action: string): string {
  const a = action.trim();
  const m = a.match(/conversionActions\/(\d+)/);
  if (m) return m[1];
  return a.replace(/[^0-9]/g, "");
}

/**
 * Exchange the long-lived refresh token for a short-lived access token. The
 * refresh token must have been granted the
 * `https://www.googleapis.com/auth/datamanager` scope.
 * Throws on failure (the caller catches and logs).
 */
export async function getAccessToken(cfg: GoogleAdsConfig): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth token exchange failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text) as { access_token?: string };
  if (!json.access_token) {
    throw new Error(`OAuth token response had no access_token: ${text.slice(0, 300)}`);
  }
  return json.access_token;
}

/** True for statuses worth retrying (network blip, rate limit, server error). */
function isTransient(status: number): boolean {
  return status === 0 || status === 429 || (status >= 500 && status <= 599);
}

/** Build the Data Manager `destination` for a Google Ads conversion action. */
function buildDestination(cfg: GoogleAdsConfig, action: string): Record<string, unknown> {
  const destination: Record<string, unknown> = {
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: cfg.customerId },
    productDestinationId: conversionActionId(action),
  };
  // A login account is only needed when operating through a manager. Our ad
  // account is accessed directly, so this is omitted unless a real manager is set.
  if (cfg.loginCustomerId && cfg.loginCustomerId !== cfg.customerId) {
    destination.loginAccount = { accountType: "GOOGLE_ADS", accountId: cfg.loginCustomerId };
  }
  return destination;
}

/**
 * Upload a single gclid-based offline conversion event. Data Manager processes
 * asynchronously and has NO partial-failure mode: a 200 means the request was
 * accepted for processing; a non-2xx means the whole request was rejected (body
 * carries the reason). Retries transient failures up to 3 attempts.
 */
export async function uploadClickConversion(
  cfg: GoogleAdsConfig,
  input: ClickConversionInput,
): Promise<UploadResult> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken(cfg);
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }

  const event: Record<string, unknown> = {
    eventTimestamp: input.conversionDateTime,
    // Data Manager requires eventSource. A gclid is a web-click identifier, so
    // WEB is the correct source even though the conversion itself is offline.
    eventSource: "WEB",
    adIdentifiers: { gclid: input.gclid },
  };
  if (typeof input.value === "number" && Number.isFinite(input.value) && input.value > 0) {
    event.conversionValue = input.value;
    event.currency = input.currencyCode ?? "CAD";
  }

  const payload = JSON.stringify({
    destinations: [buildDestination(cfg, input.conversionAction)],
    events: [event],
    validateOnly: false,
  });

  const maxAttempts = 3;
  let last: UploadResult = { ok: false, status: 0, body: "no attempt made" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(INGEST_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: payload,
      });
      const text = await res.text();
      if (!res.ok) {
        last = { ok: false, status: res.status, body: text };
        if (isTransient(res.status) && attempt < maxAttempts) {
          await delay(500 * attempt);
          continue;
        }
        return last;
      }
      return { ok: true, status: res.status, body: text };
    } catch (e) {
      last = { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
      if (attempt < maxAttempts) {
        await delay(500 * attempt);
        continue;
      }
    }
  }
  return last;
}
