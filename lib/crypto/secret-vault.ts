/**
 * Application-layer encryption for sensitive tokens at rest.
 *
 * Phase 4.6. Intuit's QuickBooks Online security requirements demand
 * that OAuth refresh tokens be encrypted at the application layer
 * (not just at the disk layer of the managed database) using a
 * symmetric algorithm — AES preferred — with the key stored in a
 * separate configuration file. This module implements that envelope
 * encryption pattern using AES-256-GCM.
 *
 * Key sourcing:
 *   - The 32-byte AES key is read from the `TOKEN_ENCRYPTION_KEY`
 *     environment variable as a base64 string.
 *   - Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
 *   - Store in Netlify env vars marked secret. NEVER commit to git.
 *
 * Output format: `v1:<iv-base64>:<tag-base64>:<ciphertext-base64>`.
 *
 * Why GCM: authenticated encryption — any tampering with the
 * ciphertext or the IV produces a decryption failure rather than
 * silently returning garbage.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32; // bytes
const IV_LEN = 12; // bytes — 96-bit IV is the GCM standard
const FORMAT_VERSION = "v1";

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Add a 32-byte base64 value to Netlify env. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\".",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be exactly ${KEY_LEN} bytes when base64-decoded; got ${buf.length}. Regenerate the key.`,
    );
  }
  cachedKey = buf;
  return buf;
}

/**
 * Encrypt a string with the configured AES key. Output is a single
 * URL-safe-ish string carrying version + IV + auth tag + ciphertext.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a value produced by `encryptSecret`. Throws on tampered
 * ciphertext, wrong key, or unsupported format.
 *
 * Backwards-compat: if `value` doesn't start with a known format
 * prefix (e.g., legacy plaintext tokens written before encryption
 * landed), returns it as-is. This lets us roll the change forward
 * without a breaking migration; legacy rows get re-encrypted on
 * their next refresh.
 */
export function decryptSecret(value: string): string {
  if (!value) return value;
  if (!value.startsWith(`${FORMAT_VERSION}:`)) {
    // Treat as plaintext for backwards compatibility.
    return value;
  }
  const parts = value.split(":");
  if (parts.length !== 4) {
    throw new Error("Encrypted token has unexpected format.");
  }
  const [, ivB64, tagB64, encB64] = parts;
  const key = loadKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/** Convenience for token storage flows that need to know whether a
 *  value is currently encrypted (so we can re-encrypt on read if
 *  it isn't yet). */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(`${FORMAT_VERSION}:`);
}
