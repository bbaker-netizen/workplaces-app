/**
 * Page-range parsing.
 *
 * Split out from `lib/pdf/page-ops.ts` on purpose: this is needed by the
 * browser editor to validate what someone typed, and page-ops imports pdf-lib
 * at module scope. Importing the parser from there would pull the whole PDF
 * writing library into the client bundle for the sake of one pure function.
 */

/**
 * Parse a page range the way a person writes one: "1", "2,5", "3-7",
 * "2,4,7-9", "3-last", "last".
 *
 * Returns ascending unique page numbers. Anything unparseable is ignored
 * rather than throwing, so a half-typed range does not produce an error on
 * every keystroke; the caller checks for an empty result instead.
 */
export function parsePageRange(input: string, pageCount: number): number[] {
  const out = new Set<number>();
  for (const rawPart of input.split(",")) {
    const part = rawPart.trim().toLowerCase();
    if (!part) continue;

    const single = part === "last" ? pageCount : Number(part);
    if (Number.isInteger(single) && single >= 1 && single <= pageCount) {
      out.add(single);
      continue;
    }

    const range = /^(\d+|last)\s*-\s*(\d+|last)$/.exec(part);
    if (!range) continue;
    const from = range[1] === "last" ? pageCount : Number(range[1]);
    const to = range[2] === "last" ? pageCount : Number(range[2]);
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    const lo = Math.max(1, Math.min(from, to));
    const hi = Math.min(pageCount, Math.max(from, to));
    for (let p = lo; p <= hi; p += 1) out.add(p);
  }
  return Array.from(out).sort((a, b) => a - b);
}
