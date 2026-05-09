-- Phase 2.6: pgvector for Soul File semantic retrieval.
-- Enables the vector extension on Neon and adds an embedding column
-- to soul_files. text-embedding-3-small produces 1536-dim vectors;
-- we pin that dim to keep the index simple. If we ever switch to a
-- higher-dim model (text-embedding-3-large at 3072) we'll add a new
-- column rather than rewriting indexes.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "soul_files" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "soul_files" ADD COLUMN "embedding_updated_at" timestamp with time zone;--> statement-breakpoint
-- IVFFlat index for cosine-distance search. lists=100 is a reasonable
-- default for low row counts; tune as the table grows.
CREATE INDEX "soul_files_embedding_idx" ON "soul_files" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
