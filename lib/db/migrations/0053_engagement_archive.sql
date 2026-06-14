-- Engagement-level soft-delete. Archiving a client removes them from the
-- Engagements list and closes their portal; restoring brings them back.
-- This is the source of truth for "deleted/archived client" — independent
-- of whether a pipeline contact is linked.
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS engagements_archived_at_idx ON engagements (archived_at);
