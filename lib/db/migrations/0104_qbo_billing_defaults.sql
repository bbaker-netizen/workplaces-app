-- Which QuickBooks item and tax code the retainer bills against.
--
-- A QBO invoice line REQUIRES an ItemRef — an invoice can't be created
-- without naming what's being sold. There's no sensible default we could
-- pick: the id is specific to Bruce's QuickBooks file, and guessing would
-- post coaching revenue against whatever item happened to be first.
--
-- So this is chosen once in Settings and reused for every client, which also
-- means the retainer always lands in the same revenue account rather than
-- wherever the person raising it clicked.
--
-- Names stored alongside the ids purely so Settings can show the current
-- choice without a round trip to Intuit on every page load. The id is the
-- source of truth; a renamed item in QuickBooks keeps working.
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS qbo_service_item_id   text,
  ADD COLUMN IF NOT EXISTS qbo_service_item_name text,
  ADD COLUMN IF NOT EXISTS qbo_tax_code_id       text,
  ADD COLUMN IF NOT EXISTS qbo_tax_code_name     text;
