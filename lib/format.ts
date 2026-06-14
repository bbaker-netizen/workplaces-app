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
