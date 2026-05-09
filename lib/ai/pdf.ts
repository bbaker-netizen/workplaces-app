/**
 * PDF text extraction.
 *
 * Phase 2.1. Used by Generate buttons that need to read content out
 * of uploaded PDFs (TTI gap reports, resumes, business plans for
 * Soul File ingest, etc.).
 *
 * `pdf-parse` is the simplest reliable extractor for our scope. It's
 * a thin wrapper over `pdf.js` that returns plain text per page,
 * concatenated. Tables and complex layouts may produce noisy text —
 * acceptable for LLM input where downstream prompting normalizes.
 */

// `pdf-parse` ships a CJS default export; require it inline so the
// dynamic import doesn't try to load its test fixtures.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pdfParse from "pdf-parse";

export async function extractPdfText(
  bytes: ArrayBuffer | Buffer | Uint8Array,
): Promise<string> {
  const buf =
    bytes instanceof Buffer
      ? bytes
      : Buffer.from(
          bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
        );
  try {
    const result = await pdfParse(buf);
    return result.text ?? "";
  } catch (e) {
    console.error("[pdf] parse failed:", e);
    return "";
  }
}
