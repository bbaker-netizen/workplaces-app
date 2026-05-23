-- Phase 5.4 — Move program / pricing setup onto the prospect record.
--
-- Per Bruce's feedback: the BBA should auto-fill from data already
-- captured on the prospect, not require re-entering it at engagement
-- creation. The four fields are optional at first (a brand-new lead
-- often hasn't picked a program yet), but get filled in as the deal
-- moves toward contract.
--
-- Idempotent — safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prospects' AND column_name = 'program_type'
  ) THEN
    ALTER TABLE prospects ADD COLUMN program_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prospects' AND column_name = 'pricing_tier'
  ) THEN
    ALTER TABLE prospects ADD COLUMN pricing_tier text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prospects' AND column_name = 'monthly_fee_cents'
  ) THEN
    ALTER TABLE prospects ADD COLUMN monthly_fee_cents bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prospects' AND column_name = 'expected_start_date'
  ) THEN
    ALTER TABLE prospects ADD COLUMN expected_start_date timestamptz;
  END IF;
END $$;
