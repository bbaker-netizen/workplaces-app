/**
 * Embeddings wrapper.
 *
 * Phase 2.6. Used to embed Soul Files for semantic retrieval (and
 * any future RAG surfaces). Uses OpenAI's text-embedding-3-small —
 * 1536 dims, well-supported by pgvector. Cheap enough that we can
 * re-embed on every save without worrying about the bill.
 *
 * Pinned to 1536 because that's the column dim. Switching to
 * text-embedding-3-large (3072) would require a schema migration.
 */

import OpenAI from "openai";

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not configured. Add it to .env.local. Used for Soul File embeddings.",
    );
  }
  cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

export const EMBEDDING_DIM = 1536;
export const EMBEDDING_MODEL = "text-embedding-3-small";

export async function embedText(text: string): Promise<number[]> {
  // OpenAI charges per-token; truncate at 8K tokens (rough ~32K chars)
  // to stay under the model limit and bound cost. Soul Files run
  // long but we only need a representative embedding.
  const truncated = text.slice(0, 32_000);
  const response = await client().embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncated,
    encoding_format: "float",
  });
  const vector = response.data[0]?.embedding;
  if (!vector || vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding response was malformed (dim=${vector?.length ?? 0}).`,
    );
  }
  return vector;
}
