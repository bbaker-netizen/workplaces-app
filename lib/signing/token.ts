/**
 * Signing-link token generation.
 *
 * URL-safe random token used as `signature_signers.public_token`.
 * 32 bytes of entropy is overkill but cheap; we trim to 32 chars
 * after base64url-encoding so the URL stays short enough to paste.
 */

import { randomBytes } from "node:crypto";

export function newSigningToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
