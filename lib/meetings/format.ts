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
