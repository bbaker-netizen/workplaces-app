/**
 * Formatting helpers for Fireflies meeting summaries.
 *
 * Fireflies' "shorthand bullet" summary comes as one long blob where each
 * section is an emoji-led heading ("📊 **Financial Review** (01:11 - 01:16)
 * …") run together with no line breaks. `formatMeetingSummary` inserts a
 * paragraph break before each such heading so MarkdownBody renders them as
 * separate, readable paragraphs. Plain markdown bullet lists (no emoji
 * heading) are left untouched.
 *
 * We match emoji via surrogate-pair ranges (astral plane) rather than the
 * \p{Extended_Pictographic} unicode property, which needs the `u` flag and
 * a higher TS target than this project compiles to.
 */

// A high surrogate + low surrogate = one astral-plane code point (most
// emoji), optionally followed by variation selectors / ZWJ joined emoji.
const EMOJI_HEADER =
  /\s+(?=[\uD83C-\uDBFF][\uDC00-\uDFFF](?:[️‍]|[\uD83C-\uDBFF][\uDC00-\uDFFF])*\s*\*\*)/g;

export function formatMeetingSummary(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.replace(/\r\n/g, "\n").replace(EMOJI_HEADER, "\n\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Tidy a Fireflies meeting title for display.
 *
 * Fireflies names a recording after when it happened — "Jul 29, 10:41 AM
 * A&M abatement business building session craig accountability
 * discussion". We render the date and time immediately beside it, so that
 * prefix is pure duplication, and it is what pushed the longest titles
 * onto a second line and made the list look ragged. Stripping it is both
 * tidier and shorter, without losing the part that distinguishes one
 * recording from another — which lives at the END of these titles.
 *
 * Also lifts the first letter: Fireflies preserves however the meeting was
 * typed into a calendar, so a list reads "estimating meeting…" next to
 * "A&M abatement…" for no reason the eye can justify.
 */
export function cleanMeetingTitle(raw: string | null): string {
  const t = (raw ?? "").trim();
  if (!t) return "Untitled meeting";
  const stripped = t
    // "Jul 29, 10:41 AM " / "Jul 29, 2026, 10:41 a.m. "
    .replace(
      /^[A-Z][a-z]{2}\s+\d{1,2},\s*(?:\d{4},\s*)?\d{1,2}:\d{2}\s*[ap]\.?m\.?\s*[-–—]?\s*/i,
      "",
    )
    .trim();
  const out = stripped.length > 0 ? stripped : t;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
