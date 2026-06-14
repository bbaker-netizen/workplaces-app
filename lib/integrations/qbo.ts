/**
 * QuickBooks Online integration.
 *
 * Phase 4.6. Direct REST calls — no SDK dependency, since `node-quickbooks`
 * is callback-based and the official Intuit SDK is heavy.
 *
 * OAuth: Authorization Code grant with refresh tokens.
 *   - access_token expires in 1 hour
 *   - refresh_token expires in 100 days
 *   - tokens stored in qbo_oauth_tokens (per Coach)
 *
 * Production vs sandbox:
 *   - Production base: https://quickbooks.api.intuit.com
 *   - Sandbox base:    https://sandbox-quickbooks.api.intuit.com
 *   - Switch via QBO_ENVIRONMENT env var ("production" | "sandbox")
 *
 * Required env vars:
 *   - QBO_CLIENT_ID
 *   - QBO_CLIENT_SECRET
 *   - QBO_REDIRECT_URI         (e.g. https://workplaces-the-builder.netlify.app/api/oauth/qbo/callback)
 *   - QBO_ENVIRONMENT          (default "production")
 *   - QBO_WEBHOOK_VERIFIER_TOKEN  (Intuit webhook signature secret)
 */

import { eq } from "drizzle-orm";
import { qboOauthTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { decryptSecret } from "@/lib/crypto/secret-vault";

const PROD_API_BASE = "https://quickbooks.api.intuit.com";
const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";
const OAUTH_TOKEN_ENDPOINT =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const OAUTH_REVOKE_ENDPOINT =
  "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export function qboApiBase(): string {
  return process.env.QBO_ENVIRONMENT === "sandbox"
    ? SANDBOX_API_BASE
    : PROD_API_BASE;
}

export function qboAuthorizeUrl(state: string): string {
  const clientId = process.env.QBO_CLIENT_ID;
  const redirect = process.env.QBO_REDIRECT_URI;
  if (!clientId || !redirect) {
    throw new Error(
      "QBO_CLIENT_ID and QBO_REDIRECT_URI must be set to start the OAuth flow.",
    );
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    // Accounting-only. The Builder reads invoice payment status from
    // the Accounting API's Invoice.Balance field; it doesn't call any
    // Payments API endpoints, so requesting com.intuit.quickbooks.payment
    // would be an unused scope and Intuit production review will flag
    // it. Add the payment scope back here if/when we wire programmatic
    // Payments API features.
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: redirect,
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

export type QboTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
};

/**
 * Exchange an authorization code for an initial token pair.
 */
export async function exchangeAuthCode(
  code: string,
): Promise<QboTokenSet> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: requireEnv("QBO_REDIRECT_URI"),
  });
}

/**
 * Use the refresh token to mint a new access token. Always call before
 * any API request — Intuit doesn't extend access_token expiry on use.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<QboTokenSet> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<QboTokenSet> {
  const clientId = requireEnv("QBO_CLIENT_ID");
  const clientSecret = requireEnv("QBO_CLIENT_SECRET");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!resp.ok) {
    throw new Error(
      `QBO token exchange failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };
  const now = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(now + data.expires_in * 1000),
    refreshExpiresAt: new Date(now + data.x_refresh_token_expires_in * 1000),
  };
}

/**
 * Look up the Coach's stored token set, refresh it if expired (or
 * expiring within 5 minutes), persist the new pair, and return the
 * fresh access token + realm id ready for an API call.
 */
export async function getValidQboCredentials(
  coachUserProfileId: string,
): Promise<{ accessToken: string; realmId: string } | null> {
  const stored = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select()
      .from(qboOauthTokens)
      .where(eq(qboOauthTokens.coachUserProfileId, coachUserProfileId))
      .limit(1);
    return row ?? null;
  });
  if (!stored) return null;

  // Decrypt at-rest tokens. AES-256-GCM envelope encryption (Intuit
  // security policy requires application-layer encryption of refresh
  // tokens with the key stored separately from the database).
  const decryptedAccess = decryptSecret(stored.accessToken);
  const decryptedRefresh = decryptSecret(stored.refreshToken);

  const expiresSoon = stored.expiresAt.getTime() < Date.now() + 5 * 60 * 1000;
  if (!expiresSoon) {
    return { accessToken: decryptedAccess, realmId: stored.realmId };
  }

  // Refresh.
  const refreshed = await refreshAccessToken(decryptedRefresh);
  await withSystemContext(async (tx) => {
    const { encryptSecret } = await import("@/lib/crypto/secret-vault");
    await tx
      .update(qboOauthTokens)
      .set({
        accessToken: encryptSecret(refreshed.accessToken),
        refreshToken: encryptSecret(refreshed.refreshToken),
        expiresAt: refreshed.expiresAt,
        refreshExpiresAt: refreshed.refreshExpiresAt,
      })
      .where(eq(qboOauthTokens.coachUserProfileId, coachUserProfileId));
  });
  return { accessToken: refreshed.accessToken, realmId: stored.realmId };
}

export async function revokeQboTokens(refreshToken: string): Promise<void> {
  const clientId = requireEnv("QBO_CLIENT_ID");
  const clientSecret = requireEnv("QBO_CLIENT_SECRET");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  await fetch(OAUTH_REVOKE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token: refreshToken }),
  });
}

/* ----------------------------- API surface ----------------------------- */

/**
 * Generic authenticated call against the QBO REST API. Handles base URL
 * + auth header + minor-version pinning. Captures `intuit_tid` from the
 * response header and logs it (without any payload data) for support
 * traceability — Intuit recommends this for every API call.
 */
async function qboFetch(
  accessToken: string,
  realmId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${qboApiBase()}/v3/company/${realmId}${path}${path.includes("?") ? "&" : "?"}minorversion=70`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (
    init.body &&
    !headers.has("Content-Type") &&
    typeof init.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }
  const resp = await fetch(url, { ...init, headers });
  // Intuit's intuit_tid uniquely identifies every API call; logging it
  // (with no payload data) lets Intuit support trace any issue back.
  const tid = resp.headers.get("intuit_tid") ?? resp.headers.get("intuit-tid");
  if (tid) {
    const op = `${init.method ?? "GET"} ${path.split("?")[0]}`;
    console.info(
      `[qbo] op=${op} status=${resp.status} intuit_tid=${tid}`,
    );
  }
  return resp;
}

export type QboCustomer = {
  Id: string;
  DisplayName: string;
  PrimaryEmailAddr?: { Address?: string } | null;
};

/**
 * Find a customer by email; returns null if no match.
 */
export async function findCustomerByEmail(
  accessToken: string,
  realmId: string,
  email: string,
): Promise<QboCustomer | null> {
  const safe = email.replace(/'/g, "''");
  const query = `select * from Customer where PrimaryEmailAddr = '${safe}'`;
  const resp = await qboFetch(
    accessToken,
    realmId,
    `/query?query=${encodeURIComponent(query)}`,
  );
  if (!resp.ok) {
    throw new Error(
      `QBO customer lookup failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const data = (await resp.json()) as {
    QueryResponse: { Customer?: QboCustomer[] };
  };
  return data.QueryResponse.Customer?.[0] ?? null;
}

/**
 * List active QuickBooks customers (id, display name, email) for the
 * "Link QuickBooks customer" picker. Paged; returns all active customers.
 */
export async function listCustomers(
  accessToken: string,
  realmId: string,
): Promise<QboCustomer[]> {
  const pageSize = 100;
  let start = 1;
  const out: QboCustomer[] = [];
  for (;;) {
    const query =
      `select Id, DisplayName, PrimaryEmailAddr from Customer ` +
      `where Active = true startposition ${start} maxresults ${pageSize}`;
    const resp = await qboFetch(
      accessToken,
      realmId,
      `/query?query=${encodeURIComponent(query)}`,
    );
    if (!resp.ok) {
      throw new Error(
        `QBO customer list failed (${resp.status}): ${await resp.text()}`,
      );
    }
    const data = (await resp.json()) as {
      QueryResponse: { Customer?: QboCustomer[] };
    };
    const batch = data.QueryResponse.Customer ?? [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    start += pageSize;
  }
  return out;
}

/**
 * Sum of all payments QuickBooks has recorded against a customer, in
 * cents — money actually received. Reads the Payment entity (available
 * under the accounting scope; no Payments-API scope needed), paging
 * through results and summing TotalAmt. Returns 0 when the customer has
 * no payments on file.
 */
export async function getCustomerTotalPaymentsCents(
  accessToken: string,
  realmId: string,
  customerId: string,
): Promise<number> {
  // Sum BOTH Payments (cash applied to invoices) and SalesReceipts
  // (point-of-sale, no invoice). Counting Payments alone undercounts any
  // client paid via sales receipts — the likely cause of low lifetime
  // totals for long-standing clients.
  const payments = await sumEntityTotalsCents(
    accessToken,
    realmId,
    customerId,
    "Payment",
  );
  const salesReceipts = await sumEntityTotalsCents(
    accessToken,
    realmId,
    customerId,
    "SalesReceipt",
  );
  return payments + salesReceipts;
}

/**
 * Sum `TotalAmt` across every row of a QBO entity for one customer,
 * paginating until the result set is exhausted.
 */
async function sumEntityTotalsCents(
  accessToken: string,
  realmId: string,
  customerId: string,
  entity: "Payment" | "SalesReceipt",
): Promise<number> {
  const safe = customerId.replace(/'/g, "''");
  const pageSize = 100;
  let start = 1;
  let totalCents = 0;
  for (;;) {
    const query =
      `select * from ${entity} where CustomerRef = '${safe}' ` +
      `startposition ${start} maxresults ${pageSize}`;
    const resp = await qboFetch(
      accessToken,
      realmId,
      `/query?query=${encodeURIComponent(query)}`,
    );
    if (!resp.ok) {
      throw new Error(
        `QBO ${entity} query failed (${resp.status}): ${await resp.text()}`,
      );
    }
    const data = (await resp.json()) as {
      QueryResponse: Record<string, Array<{ TotalAmt?: number }> | undefined>;
    };
    const rows = data.QueryResponse[entity] ?? [];
    for (const r of rows) {
      // Round each row to cents before summing to avoid float drift.
      totalCents += Math.round((r.TotalAmt ?? 0) * 100);
    }
    if (rows.length < pageSize) break;
    start += pageSize;
  }
  return totalCents;
}

/* ----------------------------- helpers ----------------------------- */

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(
      `${key} is not set. Add it to .env.local (or the Netlify dashboard for production).`,
    );
  }
  return v;
}
