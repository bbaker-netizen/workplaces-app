/**
 * Robust body parsing for the public lead-capture webhooks.
 *
 * Why this exists: our inbound lead webhooks are hand-built in Make.com. Each
 * HTTP module holds a *raw* JSON template and interpolates values straight into
 * it — e.g. `{ "message": "Q4 top challenge: {{1.answers.q4}}" }`. Make does NOT
 * JSON-escape those interpolations, so the moment a lead's free-text answer
 * contains a double quote, a backslash or a newline, the body Make transmits is
 * invalid JSON. A clean browser/curl test never hits this (simple values parse
 * fine); a real submission routinely does.
 *
 * The old parser called `req.json()` and, on ANY throw, silently returned `{}`.
 * That turned "malformed JSON" into "no fields present", which downstream read
 * as "email address required" — a 400 returned in milliseconds, before the save
 * code ran, with nothing logged. Every quiz lead carrying a quote or newline was
 * dropped and mis-diagnosed.
 *
 * This parser:
 *   1. Handles form-encoded / multipart bodies (each field already escaped).
 *   2. Fast-paths strict JSON.
 *   3. On a strict-parse failure, repairs the common webhook malformations
 *      (unescaped quotes / control characters) with `jsonrepair` and retries.
 *   4. Never masquerades: a genuinely unreadable body is reported as such so the
 *      caller can log it and return an accurate error instead of "no email".
 */

import { jsonrepair } from "jsonrepair";

export type ParsedWebhookBody =
  | { ok: true; body: Record<string, unknown>; repaired: boolean }
  | { ok: false; reason: "empty" | "unparseable"; raw: string };

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function parseWebhookBody(req: Request): Promise<ParsedWebhookBody> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  // Form-encoded / multipart: the sender URL-encodes each field, so no free-text
  // value can break the envelope. Parse it directly.
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    try {
      const form = await req.formData();
      return {
        ok: true,
        body: Object.fromEntries(form.entries()) as Record<string, unknown>,
        repaired: false,
      };
    } catch {
      return { ok: false, reason: "unparseable", raw: "" };
    }
  }

  // Everything else is treated as JSON. This covers `application/json` and the
  // common case of a platform POSTing JSON with a missing/loose content-type.
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, reason: "unparseable", raw: "" };
  }
  if (text.trim() === "") return { ok: false, reason: "empty", raw: text };

  // Fast path: well-formed JSON.
  try {
    const obj = asObject(JSON.parse(text));
    if (obj) return { ok: true, body: obj, repaired: false };
  } catch {
    // fall through to the repair path
  }

  // Recovery path: repair the unescaped quotes / control characters that Make's
  // raw-template interpolation produces, then parse the result.
  try {
    const obj = asObject(JSON.parse(jsonrepair(text)));
    if (obj) return { ok: true, body: obj, repaired: true };
  } catch {
    // unrecoverable
  }

  return { ok: false, reason: "unparseable", raw: text };
}
