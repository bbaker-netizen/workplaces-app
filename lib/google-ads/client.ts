/**
 * Minimal Google Ads REST client for offline conversion imports. Just enough to
 * exchange a refresh token for an access token and call
 * `customers/{id}:uploadClickConversions`. No SDK — a couple of fetches keep the
 * dependency surface (and the bundle) small.
 *
 * Every function is defensive: transient failures are retried with backoff, and
 * the raw Google response is returned verbatim on failure so the caller can log
 * it (never swallowed). ERP build spec 2026-07-13, item 6.
 */

import type { GoogleAdsConfig } from "@/lib/google-ads/config";

const API_VERSION = "v18";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface ClickConversionInput {
  gclid: string;
  /** Resource name or bare numeric id of the conversion action. */
  conversionAction: string;
  /** "yyyy-MM-dd HH:mm:ss+HH:mm" in the account time zone. */
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

/** Build the full conversion-action resource name. Accepts either a full
 *  `customers/{cid}/conversionActions/{id}` or a bare numeric id. */
export function conversionActionResourceName(
  cfg: GoogleAdsConfig,
  action: string,
): string {
  const a = action.trim();
  if (a.includes("/")) return a; // already a resource name
  return `customers/${cfg.customerId}/conversionActions/${a}`;
}

/**
 * Exchange the long-lived refresh token for a short-lived access token.
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

/**
 * Upload a single ClickConversion. Returns ok=false with the verbatim body on
 * any failure — including a 200 that carries a `partialFailureError` (Google's
 * way of rejecting individual rows). Retries transient failures up to 3 attempts.
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

  const conversion: Record<string, unknown> = {
    gclid: input.gclid,
    conversionAction: conversionActionResourceName(cfg, input.conversionAction),
    conversionDateTime: input.conversionDateTime,
  };
  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    conversion.conversionValue = input.value;
    conversion.currencyCode = input.currencyCode ?? "CAD";
  }

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cfg.customerId}:uploadClickConversions`;
  const payload = JSON.stringify({
    conversions: [conversion],
    // partialFailure=true so one bad row is reported in the body rather than
    // failing the whole request; we treat any partialFailureError as a failure.
    partialFailure: true,
    validateOnly: false,
  });

  const maxAttempts = 3;
  let last: UploadResult = { ok: false, status: 0, body: "no attempt made" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "developer-token": cfg.developerToken,
          "login-customer-id": cfg.loginCustomerId,
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
      // 200 — but a per-row rejection surfaces as partialFailureError.
      let hasPartialFailure = false;
      try {
        const json = JSON.parse(text) as { partialFailureError?: unknown };
        hasPartialFailure = Boolean(json.partialFailureError);
      } catch {
        // Non-JSON 200 is unexpected; treat as success since HTTP said ok.
      }
      if (hasPartialFailure) {
        return { ok: false, status: res.status, body: text };
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
