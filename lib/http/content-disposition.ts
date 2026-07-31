/**
 * Build a `Content-Disposition` header that cannot throw.
 *
 * **The bug this exists to stop.** HTTP header values are ByteStrings —
 * every character must fit in one byte (0–255). Node's `Response`
 * constructor enforces that, and it throws a `TypeError` rather than
 * dropping the character:
 *
 *   Cannot convert argument to a ByteString because the character at
 *   index 50 has a value of 8212 which is greater than 255.
 *
 * 8212 is `—`, the em dash. Every signed PDF this app has ever produced
 * is named `<subject> — signed.pdf`, because `completeEnvelope` appends
 * that suffix AFTER sanitising the subject. So interpolating the filename
 * straight into the header threw inside the route handler, Next.js turned
 * the unhandled throw into an HTTP 500, and the executed contract became
 * the one file nobody could open. It failed for every signed agreement,
 * not for one client, and it looked like a server fault rather than a
 * naming fault — which is why it went unexplained.
 *
 * **Why fix it here and not by renaming the files.** Renaming would need
 * a data migration, would only cover rows we knew about, and would leave
 * the next non-ASCII filename — a client's own upload with an accent, a
 * curly apostrophe out of Word — to break it again. Encoding correctly at
 * the boundary fixes every existing row and every future one, and it lets
 * filenames keep the punctuation they are supposed to have.
 *
 * **What it emits.** Both forms, per RFC 6266:
 *
 *   attachment; filename="Business building agreement - signed.pdf";
 *               filename*=UTF-8''Business%20building%20agreement%20%E2%80%94%20signed.pdf
 *
 * `filename` is a plain-ASCII fallback for anything ancient; `filename*`
 * (RFC 5987 percent-encoding) carries the real name and is what every
 * current browser actually uses. A client that understands neither still
 * gets a sensible name rather than an error page.
 */

/**
 * Characters that have a decent ASCII equivalent. Transliterating these
 * keeps the fallback name readable — `agreement - signed.pdf` rather
 * than `agreement _ signed.pdf` — for the small set that actually turns
 * up in filenames generated or uploaded here.
 */
const ASCII_EQUIVALENTS: Record<string, string> = {
  "\u2014": "-", // — em dash (every signed PDF has one)
  "\u2013": "-", // – en dash
  "\u2012": "-", // ‒ figure dash
  "\u2212": "-", // − minus
  "\u2018": "'", // ' left single quote
  "\u2019": "'", // ' right single quote (Word's apostrophe)
  "\u201A": "'",
  "\u201C": '"', // " left double quote
  "\u201D": '"', // " right double quote
  "\u201E": '"',
  "\u2026": "...", // … ellipsis
  "\u00A0": " ", // non-breaking space
  "\u2022": "-", // • bullet
};

/**
 * Reduce a filename to printable ASCII, safe to sit inside a quoted
 * header parameter.
 *
 * Order matters: transliterate first so `—` becomes `-`, then drop
 * whatever is still outside the printable range, then remove the two
 * characters that would break out of the quoted string (`"` and `\`).
 */
export function asciiFallbackFilename(filename: string): string {
  const transliterated = Array.from(filename)
    .map((ch) => ASCII_EQUIVALENTS[ch] ?? ch)
    .join("");

  const ascii = transliterated
    // Anything still non-ASCII, plus control characters, becomes "_".
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, "_")
    // `"` and `\` would terminate or escape the quoted parameter.
    .replace(/["\\]/g, "")
    // Collapse the runs of underscores transliteration can leave behind.
    .replace(/_{2,}/g, "_")
    .trim();

  // Never return empty — a bare `filename=""` makes some browsers save
  // the file under the URL's last path segment, which here is "download".
  return ascii.length > 0 ? ascii : "download";
}

/**
 * Build the full header value.
 *
 * @param filename     the real filename, non-ASCII and all
 * @param disposition  `attachment` to download, `inline` to render in
 *                     the browser (the signing page embeds the PDF)
 */
export function contentDisposition(
  filename: string,
  disposition: "attachment" | "inline" = "attachment",
): string {
  const fallback = asciiFallbackFilename(filename);
  // encodeURIComponent leaves ! ' ( ) * unescaped; RFC 5987's attr-char
  // set excludes them, so escape those too rather than emit a value a
  // strict parser could reject.
  const encoded = encodeURIComponent(filename).replace(
    /['()!*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * A media type safe to put in a `Content-Type` header.
 *
 * `documents.file_type` is whatever the uploading browser claimed, so it
 * is user-controlled: the same ByteString rule applies, and a value with
 * a newline in it would be header injection. Anything that isn't a
 * plausible media type falls back to a generic binary type, which makes
 * the browser download rather than guess.
 */
export function safeContentType(
  fileType: string | null | undefined,
  fallback = "application/octet-stream",
): string {
  if (!fileType) return fallback;
  const trimmed = fileType.trim();
  // type/subtype plus optional parameters, printable ASCII only.
  if (!/^[\x20-\x7E]+$/.test(trimmed)) return fallback;
  if (!/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+/.test(trimmed))
    return fallback;
  return trimmed;
}

/**
 * The MIME variant, for a `Content-Disposition` line inside a message
 * this app builds by hand (the Gmail sender assembles raw RFC 5322).
 *
 * Header bytes in a mail message must be ASCII too. The Gmail sender
 * base64-encodes the whole message as UTF-8, so a non-ASCII filename
 * did not throw there — it silently produced a mis-decoded attachment
 * name in the recipient's client instead. Same defect, quieter symptom:
 * the signed agreement arrived with its name mangled.
 *
 * RFC 2231 uses the same `filename*=UTF-8''…` continuation as RFC 5987,
 * so the encoding is shared.
 */
export function mimeContentDisposition(filename: string): string {
  return contentDisposition(filename, "attachment");
}
