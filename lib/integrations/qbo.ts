/**
 * QuickBooks Online integration.
 *
 * Phase 4.6. Direct REST calls — no SDK dependency, since `node-quickbooks`
 * is callback-based and the official Intuit SDK is heavy.
 *
 * OAuth: Authorization Code grant with refresh tokens.
 *   - access_token expires in 1 hour
 *   - refresh_token expires in 100 days
 *   - tokens stored in qbo_oauth_tokens (per Business Builder)
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
 * Look up the Business Builder's stored token set, refresh it if expired (or
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

export async function createCustomer(
  accessToken: string,
  realmId: string,
  input: { displayName: string; email?: string | null; companyName?: string | null },
): Promise<QboCustomer> {
  const body = {
    DisplayName: input.displayName,
    CompanyName: input.companyName ?? input.displayName,
    PrimaryEmailAddr: input.email ? { Address: input.email } : undefined,
  };
  const resp = await qboFetch(accessToken, realmId, "/customer", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(
      `QBO customer create failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const data = (await resp.json()) as { Customer: QboCustomer };
  return data.Customer;
}

export type QboInvoiceLine = {
  description: string;
  amount: number; // dollars (not cents)
  // Reference to a QBO Item (service / product). Required by QBO.
  itemRef?: string;
};

export type QboInvoiceCreateInput = {
  customerId: string;
  lines: QboInvoiceLine[];
  dueDate?: string; // ISO date YYYY-MM-DD
  customerMemo?: string;
};

export type QboInvoiceResult = {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  TotalAmt: number;
  Balance: number;
  DueDate?: string;
  InvoiceLink?: string;
};

/**
 * Create an invoice. The line itemRef defaults to QBO's universal
 * "Services" item if the caller doesn't provide one — Bruce can
 * customize later via the Items tab in QBO.
 */
export async function createInvoice(
  accessToken: string,
  realmId: string,
  input: QboInvoiceCreateInput,
): Promise<QboInvoiceResult> {
  const body = {
    CustomerRef: { value: input.customerId },
    Line: input.lines.map((line) => ({
      Amount: line.amount,
      DetailType: "SalesItemLineDetail",
      Description: line.description,
      SalesItemLineDetail: {
        ItemRef: { value: line.itemRef ?? "1" },
      },
    })),
    ...(input.dueDate ? { DueDate: input.dueDate } : {}),
    ...(input.customerMemo
      ? { CustomerMemo: { value: input.customerMemo } }
      : {}),
  };

  const resp = await qboFetch(accessToken, realmId, "/invoice", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(
      `QBO invoice create failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const data = (await resp.json()) as { Invoice: QboInvoiceResult };
  return data.Invoice;
}

export async function getInvoice(
  accessToken: string,
  realmId: string,
  invoiceId: string,
): Promise<QboInvoiceResult> {
  const resp = await qboFetch(accessToken, realmId, `/invoice/${invoiceId}`);
  if (!resp.ok) {
    throw new Error(
      `QBO invoice fetch failed (${resp.status}): ${await resp.text()}`,
    );
  }
  const data = (await resp.json()) as { Invoice: QboInvoiceResult };
  return data.Invoice;
}

/**
 * Build the public-facing payment link for a QBO invoice. QBO doesn't
 * return one in the API; you construct it from the realm + invoice id.
 */
export function qboInvoicePaymentLink(
  realmId: string,
  invoiceId: string,
): string {
  const env = process.env.QBO_ENVIRONMENT === "sandbox" ? "sandbox" : "qbo";
  return `https://${env}.intuit.com/Account/${realmId}/SendInvoice?txnId=${invoiceId}`;
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
