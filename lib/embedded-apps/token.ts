/**
 * Token-passthrough auth for embedded apps.
 *
 * Phase 4. CLAUDE.md "Embedded Apps Module — Auth modes":
 *   - public — embedded app is publicly accessible.
 *   - token_passthrough — Builder generates a signed token; embedded
 *     app validates it.
 *   - clerk_sso — embedded app uses Clerk; SSO works automatically.
 *
 * This module implements `token_passthrough`. The Builder signs a
 * short-lived (5 minute) HMAC-SHA256 token containing the caller's
 * engagement / user / role. The embedded app verifies the signature
 * with the same `EMBEDDED_APPS_TOKEN_SECRET` and reads the payload to
 * scope its responses.
 *
 * Token format: `<base64url(json payload)>.<base64url(hmac signature)>`.
 *
 * Embedded app verification (in plain language):
 *   1. Read the `builder_token` query param.
 *   2. Split on `.`. Recompute HMAC-SHA256 over the payload half with
 *      the shared secret. Compare in constant time.
 *   3. Parse the payload JSON. Check `exp` is in the future.
 *   4. Use `engagementId`, `userProfileId`, `role` to authorize the
 *      response.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 5 * 60;

export type EmbeddedAppToken = {
  engagementId: string;
  userProfileId: string;
  email: string;
  role: string;
  exp: number; // unix seconds
};

function secret(): string {
  const s = process.env.EMBEDDED_APPS_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "EMBEDDED_APPS_TOKEN_SECRET must be set (32+ random bytes) for token_passthrough embedded apps. Generate with `openssl rand -hex 32` and set it both here and on the embedded app side.",
    );
  }
  return s;
}

function b64urlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export function signEmbeddedAppToken(
  payload: Omit<EmbeddedAppToken, "exp">,
): string {
  const full: EmbeddedAppToken = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = b64urlEncode(Buffer.from(JSON.stringify(full)));
  const sig = createHmac("sha256", secret()).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

export function verifyEmbeddedAppToken(
  token: string,
): EmbeddedAppToken | null {
  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigStr);
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret()).update(body).digest();
  if (
    providedSig.length !== expected.length ||
    !timingSafeEqual(providedSig, expected)
  ) {
    return null;
  }
  let payload: EmbeddedAppToken;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf-8"));
  } catch {
    return null;
  }
  if (
    typeof payload.exp !== "number" ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return payload;
}

/**
 * Append a fresh `builder_token` query param to the embedded app's
 * URL. Caller decides whether to embed in src directly or pass via
 * postMessage; src is the simpler default.
 */
export function appUrlWithToken(
  appUrl: string,
  payload: Omit<EmbeddedAppToken, "exp">,
): string {
  const token = signEmbeddedAppToken(payload);
  const url = new URL(appUrl);
  url.searchParams.set("builder_token", token);
  return url.toString();
}
