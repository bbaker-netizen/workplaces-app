-- Where a document came from.
--
-- The bug this closes: the lead's "Documents on file" panel rendered the
-- uploader's name, and fell back to the literal string "The Climb" when
-- there wasn't one. Exactly two code paths write a document with no
-- uploader — The Climb ingest, and the signing flow filing a completed
-- agreement — so every signed agreement in the system was captioned as
-- though it had arrived from the assessment tool.
--
-- That is how a source PDF and its signed counterpart came to read as two
-- unrelated near-identical files three days apart, and why deleting one
-- looked reasonable. It nearly cost a real executed contract.
--
-- Fixing the caption alone would leave the same trap for the next writer
-- that files a document without a person attached, so provenance is
-- recorded at write time instead of guessed at read time.
--
--   upload    — a person chose this file (the default, and true for
--               anything a Builder or client uploads by hand)
--   the_climb — created by the The Climb assessment ingest endpoint
--   signed    — the executed PDF produced by a completed signing envelope
--
-- Deliberately a plain text column with a CHECK rather than a Postgres
-- enum: adding a value later is an ALTER TABLE that runs in the same
-- transaction as everything else, whereas ALTER TYPE ... ADD VALUE has to
-- sit alone in its own migration file (see 0089/0090).

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'upload';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_origin_check'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_origin_check
      CHECK (origin IN ('upload', 'the_climb', 'signed'));
  END IF;
END $$;

-- Backfill, most specific first.
--
-- A signed document is identifiable exactly: it is whatever an envelope
-- points at as its signed output. No guessing.
UPDATE documents d
   SET origin = 'signed'
  FROM signature_envelopes se
 WHERE se.signed_document_id = d.id
   AND d.origin = 'upload';

-- The Climb's PDFs. Narrower than "no uploader", deliberately.
--
-- The obvious rule — everything left without an uploader must be The
-- Climb, since it is the only other writer that omits one — is true of
-- rows written by today's code and FALSE of the history. Seven documents
-- from May 2026 are agreement sources with no uploader recorded, and that
-- rule would have captioned all of them "The Climb". Caught by dry-running
-- this migration against the live database before committing it: it
-- labelled 8 rows the_climb where only 1 is genuinely from the assessment.
--
-- So: a Climb PDF is attached to a prospect and is never part of a
-- signing envelope. Anything else with no uploader stays 'upload', which
-- is the honest answer — a person did put it there, we just no longer
-- know which person.
UPDATE documents d
   SET origin = 'the_climb'
 WHERE d.uploader_user_profile_id IS NULL
   AND d.origin = 'upload'
   AND d.prospect_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM signature_envelopes se
      WHERE se.source_document_id = d.id
         OR se.signed_document_id = d.id
   );

CREATE INDEX IF NOT EXISTS documents_origin_idx ON documents (origin);
