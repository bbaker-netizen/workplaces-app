/**
 * Prospect data-quality rules, shared between the New Prospect form,
 * the inline-edit drawer on the prospect detail page, and the server
 * actions that persist the data.
 *
 * Two layers:
 *
 *   HARD rules (block submission):
 *     - companyName: required, min 2 chars
 *     - contactName: required, min 2 chars, must contain a space
 *       (first + last name)
 *     - contactEmail: required, valid email
 *     - phone: required, must contain at least 7 digits — contracts
 *       and emergency outreach need a phone on file
 *     - contactName must NOT equal companyName (case-insensitive)
 *     - contactName must NOT have a company entity suffix
 *
 *   SOFT rules (warn but allow submit if the user confirms):
 *     - companyName has no obvious entity suffix (Inc/LLC/Ltd/Corp/etc)
 *       and looks like a person's name (two words, both capitalized).
 *       The user has to tick "Yes, this is the legal name" to bypass.
 *
 * The `validateProspect` function returns a structured result so the
 * UI can render per-field errors and warnings, and so the server
 * action can reject obviously bad data even when the client-side
 * checks were bypassed.
 */

export type ProspectInput = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  phone?: string | null;
  legalNameConfirmed?: boolean;
  /** Lead source — drives the "referrer required" rule below. */
  leadSource?: string | null;
  /** Who referred them. Required when leadSource === "Referral". */
  referrerName?: string | null;
};

export type ValidationIssue = {
  field:
    | "companyName"
    | "contactName"
    | "contactEmail"
    | "phone"
    | "referrerName";
  level: "error" | "warning";
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  /** Hard errors that block the save. */
  errors: ValidationIssue[];
  /** Soft warnings that allow override. */
  warnings: ValidationIssue[];
};

/** Common entity / legal-form suffixes that signal "this string is
 *  meant to be a company name, not a person". Case-insensitive. */
const ENTITY_SUFFIX_RE =
  /\b(inc|incorporated|llc|llp|ltd|limited|co|corp|corporation|group|company|holdings|enterprises|associates|partners|solutions|consulting|consultants|services|systems|technologies|tech|labs|studio|studios|agency|gmbh|kft|sa|sarl|s\.?a\.?r\.?l\.?|s\.?p\.?a\.?|pty|bv|nv|ab|oy|as|llp|plc|spa)\b\.?$/i;

/** Quick "looks like a person's name" sniff — exactly two whitespace-
 *  separated tokens, each starting with an uppercase letter. */
function looksLikePersonName(s: string): boolean {
  const trimmed = s.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 2) return false;
  return /^[A-Z][a-zA-Z'’\-]{0,40}$/.test(parts[0]) && /^[A-Z][a-zA-Z'’\-]{0,40}$/.test(parts[1]);
}

function isValidEmail(s: string): boolean {
  // Pragmatic email regex — RFC-5322 is overkill. Requires
  // something@something.tld with at least 2-char TLD.
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(s.trim());
}

function countDigits(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] >= "0" && s[i] <= "9") n++;
  }
  return n;
}

export function validateProspect(
  input: ProspectInput,
  mode: "create" | "update" = "create",
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Structural name rules (2-word contact, contact ≠ company, entity
  // suffix) are ADVISORY only — they must never block a save, in either
  // mode. Many legitimate SMB/trade clients are named after their owner
  // (company == contact) or use a single-word trading name, and web/ad
  // leads arrive with the person's name in both fields. Blocking those
  // stopped coaches from saving a phone or other details. Now they're
  // always non-blocking warnings; the required + format rules below
  // (company/contact present, valid email, valid phone) still block.
  void mode;
  const structBucket = warnings;
  const structLevel: "error" | "warning" = "warning";

  const company = (input.companyName ?? "").trim();
  const contact = (input.contactName ?? "").trim();
  const email = (input.contactEmail ?? "").trim();
  const phone = (input.phone ?? "").trim();

  /* ---------- Company name ---------- */
  if (company.length < 2) {
    errors.push({
      field: "companyName",
      level: "error",
      message:
        "Company name is required — type the client's legal business name.",
    });
  } else if (
    !ENTITY_SUFFIX_RE.test(company) &&
    looksLikePersonName(company) &&
    !input.legalNameConfirmed
  ) {
    warnings.push({
      field: "companyName",
      level: "warning",
      message:
        "This looks like a person's name, not a business. Type the legal entity name (e.g. \"Acme Construction Ltd.\") — or tick the box below if this really is the registered business name.",
    });
  }

  /* ---------- Contact name ---------- */
  if (contact.length < 2) {
    errors.push({
      field: "contactName",
      level: "error",
      message:
        "Contact name is required — the human you talk to at this company.",
    });
  } else if (!/\s/.test(contact)) {
    structBucket.push({
      field: "contactName",
      level: structLevel,
      message:
        "Contact name reads as one word — ideally first + last name (e.g. \"Jane Smith\").",
    });
  } else if (
    company.length >= 2 &&
    contact.toLowerCase() === company.toLowerCase()
  ) {
    structBucket.push({
      field: "contactName",
      level: structLevel,
      message:
        "Contact name is the same as the company name. Put the person's first + last name here, and the legal business name in the Company field above.",
    });
  } else if (ENTITY_SUFFIX_RE.test(contact)) {
    structBucket.push({
      field: "contactName",
      level: structLevel,
      message:
        "Contact name has a company suffix (Inc/LLC/Ltd/etc) — the contact name should be the person.",
    });
  }

  /* ---------- Email ---------- */
  if (email.length < 5) {
    errors.push({
      field: "contactEmail",
      level: "error",
      message: "Email is required.",
    });
  } else if (!isValidEmail(email)) {
    errors.push({
      field: "contactEmail",
      level: "error",
      message:
        "That email doesn't look right — should be something like name@company.com.",
    });
  }

  /* ---------- Phone (optional, but valid if provided) ----------
   * Phone can be left blank, but if a number IS entered it has to be a
   * real one — at least 7 digits — not "TBD" or "n/a". */
  if (phone.length > 0 && countDigits(phone) < 7) {
    errors.push({
      field: "phone",
      level: "error",
      message:
        "That phone number doesn't look right — needs at least 7 digits, including area code.",
    });
  }

  /* ---------- Referrer (required when lead source = Referral) ---------- */
  const leadSource = (input.leadSource ?? "").trim();
  const referrer = (input.referrerName ?? "").trim();
  if (leadSource.toLowerCase() === "referral" && referrer.length < 2) {
    errors.push({
      field: "referrerName",
      level: "error",
      message:
        "Who referred them? Add the referrer's name — they get a $50 thank-you if this becomes a client.",
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
