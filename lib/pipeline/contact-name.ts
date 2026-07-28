/**
 * One person's name, held as two parts and shown as one.
 *
 * `prospects.contact_name` remains the display field the whole app reads, but
 * it is now composed from `contact_first_name` / `contact_last_name` rather
 * than typed directly. That split exists because the contract needs to
 * address someone by their given name, and deriving that by taking everything
 * before the first space is wrong for compound given names and for anyone
 * with a title — silently wrong, since the agreement simply goes out reading
 * oddly.
 *
 * Keeping the composed field means the split touches the data model without
 * touching every screen that renders a lead's name.
 */

/** Join the parts into the display name. Empty parts are dropped, so a lead
 *  with only a first name renders as that, not "Jane undefined". */
export function composeContactName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  const parts = [first?.trim(), last?.trim()].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Best-effort split of a legacy single-field name, for rows written before
 * the two columns existed and for intake payloads that only carry one name.
 *
 * Splits on the FIRST space: everything after it is the surname, so
 * "Ana van der Berg" keeps its surname intact. A single word becomes the
 * first name with no surname rather than inventing one.
 */
export function splitContactName(full: string | null | undefined): {
  first: string | null;
  last: string | null;
} {
  const trimmed = (full ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { first: null, last: null };
  const i = trimmed.indexOf(" ");
  if (i === -1) return { first: trimmed, last: null };
  return {
    first: trimmed.slice(0, i),
    last: trimmed.slice(i + 1) || null,
  };
}
