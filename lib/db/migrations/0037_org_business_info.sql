-- Phase 5.5 — Business info on the org record.
--
-- The BBA + invoices + emails need the sender's legal entity name,
-- street address, province/state, tax IDs, etc. We had `orgs.name`
-- as a single display string; this migration adds the structured
-- fields contracts actually need.
--
-- All optional — existing orgs keep working with name only until
-- Bruce fills these in via /coach/settings/company.
--
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='legal_name') THEN
    ALTER TABLE orgs ADD COLUMN legal_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='business_address') THEN
    ALTER TABLE orgs ADD COLUMN business_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='business_city') THEN
    ALTER TABLE orgs ADD COLUMN business_city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='business_province') THEN
    ALTER TABLE orgs ADD COLUMN business_province text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='business_country') THEN
    ALTER TABLE orgs ADD COLUMN business_country text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='business_postal_code') THEN
    ALTER TABLE orgs ADD COLUMN business_postal_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='business_phone') THEN
    ALTER TABLE orgs ADD COLUMN business_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='business_website') THEN
    ALTER TABLE orgs ADD COLUMN business_website text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='tax_id') THEN
    ALTER TABLE orgs ADD COLUMN tax_id text;
  END IF;
END $$;
