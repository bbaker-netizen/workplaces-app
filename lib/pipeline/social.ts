/**
 * Social-handle helpers shared by server components (the prospect detail
 * page) and client components (the new-prospect form, the inline contact
 * editor). Lives in a plain module — NOT a "use client" file — so the
 * server page can call it without tripping React's client-reference guard.
 */

/** A Google search scoped to LinkedIn for this contact + company, so the
 *  Business Builder can find the profile fast and paste the URL back in. */
export function linkedInSearchUrl(name: string, company: string): string {
  const q = [name.trim(), company.trim(), "LinkedIn"]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
