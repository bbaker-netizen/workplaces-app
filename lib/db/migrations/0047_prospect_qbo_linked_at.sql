-- Records WHEN a prospect was linked to its QuickBooks customer, distinct
-- from qbo_value_synced_at (which the nightly value-sync job stamps). Drives
-- the "Linked · <date>" label on the prospect's QuickBooks card.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS qbo_linked_at timestamptz;
