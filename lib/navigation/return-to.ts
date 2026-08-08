/**
 * "Take me back where I was."
 *
 * The gap this closes: an action item opened from a client's page sent
 * you, on save or delete or cancel, to the console-wide action items
 * list — every client's items in one pile. The item you had just been
 * working on was gone, and so was the client. Jen's words: "then I can't
 * come back to the client portal, so then it's mixed in with all the
 * action items for every client and I lose the item."
 *
 * So the caller states where it came from, and the destination honours
 * it. `?from=` is a URL a user can edit, which is why it is validated
 * rather than trusted.
 */

/**
 * A `from` value is accepted only when it is a same-site console path.
 *
 * Rejects anything that could leave the site: an absolute URL, a
 * protocol-relative `//evil.example`, a backslash (which some browsers
 * normalise to `/`), or a path outside the console. Without that, a link
 * with `?from=https://…` would turn every save button into an open
 * redirect — a phishing primitive, on a page a client can be sent to.
 */
export function safeReturnTo(
  from: string | string[] | undefined,
  fallback: string,
): string {
  const value = Array.isArray(from) ? from[0] : from;
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  if (!value.startsWith("/business-builder/") && !value.startsWith("/portal/"))
    return fallback;
  return value;
}

/** Append a `from` to a href, preserving any query string already on it. */
export function withReturnTo(href: string, from: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}from=${encodeURIComponent(from)}`;
}
