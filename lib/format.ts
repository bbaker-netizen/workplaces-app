/**
 * Shared currency formatting. One place so every dollar value in the app
 * renders the same way — a leading "$", Canadian grouping, no cents.
 */

/** Format integer cents as "$1,234". Returns the given dash for null. */
export function formatCad(cents: number | null | undefined, dash = "—"): string {
  if (cents === null || cents === undefined) return dash;
  return `$${(cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Tidy a North-American phone number for display. A plain 10-digit number
 * becomes "(780) 555-1234"; an 11-digit "1"-prefixed number becomes
 * "+1 (780) 555-1234". Anything else (international, extensions) is returned
 * trimmed but otherwise untouched — we never mangle a number we don't
 * recognise.
 */
export function formatPhone(raw: string): string {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  // Drop a leading country-code "1" — we don't show +1.
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return trimmed;
}

/**
 * Tidy a website the way a non-technical user types it. Accepts bare
 * domains ("acme.com", "www.acme.com") and prepends "https://" so the
 * stored value is always a clickable absolute URL. Already-schemed
 * values (http:// / https://) pass through untouched. Returns null for
 * empty input.
 *
 * Why this exists: an `<input type="url">` rejects bare domains, which
 * silently blocked the whole new-prospect form from submitting. We now
 * accept anything and normalise here instead.
 */
export function normalizeWebsite(
  raw: string | null | undefined,
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  // Already has a scheme (http, https, mailto, etc.) — leave it.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  // Strip any accidental leading slashes, then prefix https://.
  return `https://${trimmed.replace(/^\/+/, "")}`;
}
