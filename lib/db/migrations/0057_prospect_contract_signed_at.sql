-- When the contract was signed — drives the "Date signed" sort on the
-- pipeline. Backfill existing signed/onboarded clients from updated_at so
-- the sort has something to work with for current rows.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS contract_signed_at timestamptz;
UPDATE prospects
   SET contract_signed_at = updated_at
 WHERE contract_signed_at IS NULL
   AND status IN ('contract_signed', 'onboarded');
