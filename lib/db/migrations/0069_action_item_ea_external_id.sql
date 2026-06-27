-- 0069: action_items.ea_external_id — the BB-#### id of the matching row
-- in the EA Action Items sheet (Command Central). Set when the Builder
-- pushes an item out to the EA gateway; used to update that same row
-- later and to mirror status changes back from the sheet. Null until an
-- item has been pushed (e.g. drafts are never pushed). Additive + idempotent.

ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS ea_external_id text;

CREATE INDEX IF NOT EXISTS action_items_ea_external_id_idx
  ON action_items (ea_external_id);
