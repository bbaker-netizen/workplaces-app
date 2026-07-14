/**
 * Lead-note capture — the single source of truth for pulling a lead's own
 * words out of an intake payload and folding them into the prospect's
 * profile Notes.
 *
 * Why this exists: a website contact form or a Facebook / Meta lead form
 * (bridged through Make.com) can carry the lead's free-text message under
 * all sorts of field names. Facebook in particular names each custom
 * question after the question itself — e.g. `what_is_your_biggest_challenge`
 * — so a fixed pick list of `["message","notes",...]` silently drops the
 * answer. This module:
 *
 *   1. Reads the usual note fields first (highest signal), then
 *   2. Catch-alls any OTHER free-text answer the form sent — Facebook custom
 *      questions, extra website-form fields — labelling each readably, while
 *      skipping fields we already map to columns and known platform metadata.
 *
 * The result is the lead's words, ready to store in `prospects.notes`, no
 * matter what the sending platform called the field.
 */

/** Note fields in priority order — the lead's primary message. The first
 *  non-empty one becomes the lead of the captured note. */
const NOTE_KEYS = [
  "message",
  "notes",
  "note",
  "comments",
  "comment",
  "body",
  "inquiry",
  "enquiry",
  "question",
  "questions",
  "answer",
  "answers",
  "your_message",
  "message_body",
  "how_can_we_help",
  "how_can_we_help_you",
  "what_can_we_help_with",
  "tell_us_more",
  "tell_us_about_your_business",
  "tell_us",
  "additional_info",
  "additional_information",
  "details",
  "description",
];

/** Fields we already map onto structured columns — never fold these into the
 *  free-text note (they'd be duplicated, and some are noise). Lowercased. */
const STRUCTURED_KEYS = new Set<string>([
  // identity / contact
  "email",
  "contact_email",
  "e-mail",
  "emailaddress",
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "name",
  "full_name",
  "fullname",
  "contact_name",
  "company",
  "company_name",
  "business_name",
  "business",
  "organization",
  "phone",
  "phone_number",
  "tel",
  "mobile",
  "website",
  "company_website",
  "url",
  "linkedin",
  "linkedin_url",
  "facebook",
  "facebook_url",
  "instagram",
  "instagram_url",
  "industry",
  // attribution / control
  "source",
  "lead_source",
  "channel",
  "platform",
  "utm_source",
  "utmsource",
  "utm_medium",
  "utmmedium",
  "utm_campaign",
  "utmcampaign",
  "campaign",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "click_ids",
  // calendar / booking
  "calendar_event_id",
  "event_id",
  "event_summary",
  "summary",
  "booked_session_at",
  "session_at",
  "start",
  // intake control
  "honeypot",
  "token",
  "api_key",
  "x-api-key",
]);

/** Platform metadata (mostly Facebook Lead Ads) that is not the lead's own
 *  words and should never appear in the note. Lowercased. */
const METADATA_KEYS = new Set<string>([
  "id",
  "lead_id",
  "leadgen_id",
  "form_id",
  "form_name",
  "page_id",
  "page_name",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "created_time",
  "createdtime",
  "created_at",
  "is_organic",
  "partner_name",
  "vehicle",
  "retailer_item_id",
  "custom_disclaimer_responses",
  "consent",
  "status",
]);

/** Hard cap so a hostile or runaway payload can't write an enormous note. */
const MAX_NOTE_LENGTH = 8000;

function firstString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

/** Turn a field name into a readable label: `what_is_your_biggest_challenge`
 *  → `What is your biggest challenge`. Facebook maps custom questions to
 *  snake_case field names, so this reconstructs the question text. */
function humanizeKey(key: string): string {
  const words = key
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Pull the lead's note out of an intake payload: the primary message field,
 * followed by any other free-text answers the form sent (each labelled),
 * skipping structured columns and platform metadata. Returns null when the
 * payload carries no free text at all.
 */
export function extractLeadNote(
  body: Record<string, unknown>,
): string | null {
  const primary = firstString(body, NOTE_KEYS);
  const noteKeySet = new Set(NOTE_KEYS.map((k) => k.toLowerCase()));

  const extras: string[] = [];
  for (const [rawKey, rawVal] of Object.entries(body)) {
    const key = rawKey.toLowerCase();
    if (noteKeySet.has(key)) continue; // already captured as `primary`
    if (STRUCTURED_KEYS.has(key)) continue;
    if (METADATA_KEYS.has(key)) continue;
    // Only fold in plain scalars — objects/arrays are structured payloads
    // (e.g. click_ids), not something a human typed.
    if (
      rawVal === null ||
      rawVal === undefined ||
      typeof rawVal === "object"
    ) {
      continue;
    }
    const val = String(rawVal).trim();
    if (!val) continue;
    // Don't repeat text already present in the primary message.
    if (primary && primary.includes(val)) continue;
    extras.push(`${humanizeKey(rawKey)}: ${val}`);
  }

  const parts: string[] = [];
  if (primary) parts.push(primary);
  if (extras.length > 0) parts.push(extras.join("\n"));
  if (parts.length === 0) return null;

  const combined = parts.join("\n\n").trim();
  return combined.length > MAX_NOTE_LENGTH
    ? combined.slice(0, MAX_NOTE_LENGTH)
    : combined;
}

/**
 * Merge an incoming lead note into whatever notes the prospect already has,
 * non-destructively. Used on repeat submissions so a returning lead's new
 * words reach the profile without clobbering earlier notes or anything the
 * Business Builder typed by hand.
 *
 *   - No incoming note → keep existing untouched.
 *   - No existing note → the incoming note becomes the note.
 *   - Incoming already contained in existing → no change (idempotent; a
 *     re-fired webhook won't duplicate).
 *   - Otherwise → append under a dated `— From <source> · <date> —` header.
 */
export function mergeLeadNote(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  sourceLabel: string,
  at: Date,
): string | null {
  const inc = (incoming ?? "").trim();
  const ex = (existing ?? "").trim();
  if (!inc) return existing ?? null;
  if (!ex) return inc;
  if (ex.includes(inc)) return ex;
  const stamp = at.toISOString().slice(0, 10);
  const merged = `${ex}\n\n— From ${sourceLabel} · ${stamp} —\n${inc}`;
  return merged.length > MAX_NOTE_LENGTH
    ? merged.slice(0, MAX_NOTE_LENGTH)
    : merged;
}
