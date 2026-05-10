/**
 * Text chunking for embeddings.
 *
 * Phase 4. Splits long markdown bodies into ~1500-char chunks at
 * paragraph boundaries (double-newline). Falls back to sentence
 * splits when a paragraph itself exceeds the target size, and to
 * hard character splits as the last resort. Empty chunks are dropped.
 */

const TARGET_CHARS = 1500;
const MAX_CHARS = 2400;

export function chunkMarkdown(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= MAX_CHARS) return [trimmed];

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    const merged = buffer.length === 0 ? para : `${buffer}\n\n${para}`;
    if (merged.length <= TARGET_CHARS) {
      buffer = merged;
      continue;
    }
    if (buffer.length > 0) {
      chunks.push(buffer);
      buffer = "";
    }
    if (para.length <= MAX_CHARS) {
      buffer = para;
      continue;
    }
    chunks.push(...splitOversize(para));
  }
  if (buffer.length > 0) chunks.push(buffer);
  return chunks;
}

function splitOversize(para: string): string[] {
  const sentences = para
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const out: string[] = [];
  let buffer = "";
  for (const sent of sentences) {
    const merged = buffer.length === 0 ? sent : `${buffer} ${sent}`;
    if (merged.length <= TARGET_CHARS) {
      buffer = merged;
      continue;
    }
    if (buffer.length > 0) {
      out.push(buffer);
      buffer = "";
    }
    if (sent.length <= MAX_CHARS) {
      buffer = sent;
      continue;
    }
    // Last resort: split at hard character boundary.
    for (let i = 0; i < sent.length; i += TARGET_CHARS) {
      out.push(sent.slice(i, i + TARGET_CHARS));
    }
    buffer = "";
  }
  if (buffer.length > 0) out.push(buffer);
  return out;
}
