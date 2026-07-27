-- Structured storage for the public assessment a lead takes before we speak.
--
-- Background: Base Camp (/base-camp/) already asks ten questions, scores the
-- four Business Building Blocks out of six each, and names the weakest block
-- as the reader's starting camp. All of that reached the Builder as one long
-- sentence inside prospects.notes, which meant it could be read by a human
-- and by nothing else: not filtered, not counted, not rendered as a panel,
-- and not carried into The Climb.
--
-- These two columns hold the result properly. JSONB rather than a column per
-- score because the question set will change and a second assessment should
-- not need another migration. Nullable throughout: most prospects arrive by
-- other routes and simply never have one.
--
-- Latest submission wins. Earlier ones are not lost; every submission still
-- writes its own prospect_activities row.

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS assessment jsonb;
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS assessment_at timestamptz;

-- Partial index: the only queries that care are "leads who took one", which
-- is a small slice of the table. Indexing the NULLs would be waste.
CREATE INDEX IF NOT EXISTS prospects_assessment_idx
  ON prospects (assessment_at)
  WHERE assessment IS NOT NULL;
