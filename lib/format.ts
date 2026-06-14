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
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return trimmed;
}
