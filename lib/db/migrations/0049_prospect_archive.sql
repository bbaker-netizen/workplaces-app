-- Soft-delete for prospects. The Delete buttons now archive instead of
-- hard-deleting, so a mis-click is recoverable. NULL = active; a timestamp
-- = archived (hidden from the default pipeline view).
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS prospects_archived_at_idx ON prospects (archived_at);
