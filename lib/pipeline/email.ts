/**
 * One place for the "is this a sendable email address?" check, so the
 * booking follow-through guard (server), the "Send now" button (client), and
 * the lead webhook all agree. Pragmatic, not RFC-5322: something@something.tld
 * with a 2+ char TLD and no whitespace.
 */
export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(value.trim());
}
