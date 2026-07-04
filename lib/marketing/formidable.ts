/**
 * Formidable Forms XML export parser.
 *
 * Formidable's native "Export → XML" produces one <item> per submission,
 * with the contact name in <name> and the answers in <item_meta> blocks
 * (each a <field_id> + <meta_value>). Field IDs differ per form, so instead
 * of hard-coding them we detect email and phone by the VALUE — an email
 * matches the email shape, a phone is a value that's mostly phone
 * characters with enough digits. That makes the import work for any
 * Formidable form without configuration.
 */

import type { ParsedRow } from "@/lib/marketing/csv";

/** Does this text look like a Formidable XML export (vs a CSV)? */
export function looksLikeFormidableXml(text: string): boolean {
  const head = text.slice(0, 4000);
  return (
    head.trimStart().startsWith("<?xml") ||
    (head.includes("<item") && head.includes("<item_meta"))
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True if the value reads as a phone number, not a date or prose. */
function looksLikePhone(v: string): boolean {
  const trimmed = v.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  // Reject anything that isn't overwhelmingly phone-shaped characters
  // (digits, spaces, + - ( ) . and an optional leading country code) — this
  // keeps a long message with a couple of numbers in it from matching.
  const phoneish = trimmed.replace(/[0-9()+.\-\s]/g, "");
  if (phoneish.length > 0) return false;
  // Reject obvious dates like 2025-11-18 or 11/18/2025.
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return false;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return false;
  return true;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

const ITEM_RE = /<item>([\s\S]*?)<\/item>/g;
const NAME_RE = /<name>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/name>/;
const META_RE =
  /<meta_value>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/meta_value>/g;

/**
 * Parse a Formidable XML export into name/email/phone/company rows.
 * Returns the same ParsedRow shape as the CSV parser so the import flow
 * is identical downstream.
 */
export function parseFormidableXml(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const itemMatch of Array.from(text.matchAll(ITEM_RE))) {
    const block = itemMatch[1];

    const nameMatch = NAME_RE.exec(block);
    const nameFromEl = nameMatch
      ? decodeXml(nameMatch[1] ?? nameMatch[2] ?? "")
      : "";

    const values: string[] = [];
    for (const m of Array.from(block.matchAll(META_RE))) {
      const val = decodeXml(m[1] ?? m[2] ?? "");
      if (val) values.push(val);
    }

    let email: string | null = null;
    let phone: string | null = null;
    for (const v of values) {
      if (!email && EMAIL_RE.test(v)) {
        email = v.toLowerCase();
        continue;
      }
      if (!phone && looksLikePhone(v)) {
        phone = v;
      }
    }

    // Name: prefer the <name> element; otherwise the first value that's
    // plain text (not the email, not the phone, not JSON/braces).
    let name: string | null = nameFromEl || null;
    if (!name) {
      const candidate = values.find(
        (v) =>
          v !== email &&
          v !== phone &&
          !v.startsWith("{") &&
          v.length <= 80 &&
          /[a-zA-Z]/.test(v),
      );
      name = candidate ?? null;
    }

    // Only keep rows that have an email — that's the key we de-dupe on and
    // the whole point of a marketing list.
    if (email) {
      rows.push({ name, email, phone, company: null });
    }
  }
  return rows;
}
