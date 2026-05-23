-- Phase 5.3 — Engagement pricing.
--
-- Two pieces of data:
--   1. `engagements.monthly_fee_cents` — the actual price for this
--      engagement, stored in cents to avoid floating-point math.
--   2. `engagements.pricing_tier` — optional tier identifier so we
--      can show the suggested-vs-actual delta later.
--   3. `pricing_tiers` table — one row per (org, program, tier_key)
--      with the suggested fee for that combination. The engagement
--      creation form reads this to pre-fill the fee, but the field
--      stays editable so Bruce can override on a per-deal basis.
--
-- Default tiers seeded for every existing org:
--   Accelerator small/mid/large = $900 / $1,500 / $2,500
--   Implementer  small/mid/large = $1,500 / $2,500 / $3,500
--
-- Idempotent: re-runnable against partial state.

DO $$
BEGIN
  -- Engagement-level columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'monthly_fee_cents'
  ) THEN
    ALTER TABLE engagements ADD COLUMN monthly_fee_cents bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engagements'
      AND column_name = 'pricing_tier'
  ) THEN
    ALTER TABLE engagements ADD COLUMN pricing_tier text;
  END IF;

  -- Pricing tiers table
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pricing_tiers'
  ) THEN
    CREATE TABLE pricing_tiers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      program text NOT NULL,    -- 'accelerator' | 'implementer'
      tier_key text NOT NULL,   -- 'small' | 'mid' | 'large' (or whatever the coach prefers)
      label text NOT NULL,      -- human-readable, e.g. "Small (under 10 employees)"
      monthly_fee_cents bigint NOT NULL,
      sort_order bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pricing_tiers_unique_per_org UNIQUE (org_id, program, tier_key)
    );

    CREATE INDEX pricing_tiers_org_idx ON pricing_tiers(org_id, program, sort_order);

    CREATE TRIGGER set_updated_at_pricing_tiers
    BEFORE UPDATE ON pricing_tiers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;

    CREATE POLICY pricing_tiers_org_isolation ON pricing_tiers
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
  END IF;

  -- Seed default tiers for any org that doesn't have any yet. Six rows
  -- per org. Each insert is guarded by NOT EXISTS so re-running this
  -- migration doesn't duplicate.
  INSERT INTO pricing_tiers (org_id, program, tier_key, label, monthly_fee_cents, sort_order)
  SELECT o.id, p.program, p.tier_key, p.label, p.fee_cents, p.sort_order
  FROM orgs o
  CROSS JOIN (VALUES
    ('accelerator', 'small', 'Small (under 10 employees)',   90000,  10),
    ('accelerator', 'mid',   'Mid (10-50 employees)',        150000, 20),
    ('accelerator', 'large', 'Large (50+ employees)',        250000, 30),
    ('implementer', 'small', 'Small (under 10 employees)',   150000, 110),
    ('implementer', 'mid',   'Mid (10-50 employees)',        250000, 120),
    ('implementer', 'large', 'Large (50+ employees)',        350000, 130)
  ) AS p(program, tier_key, label, fee_cents, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM pricing_tiers pt
    WHERE pt.org_id = o.id
      AND pt.program = p.program
      AND pt.tier_key = p.tier_key
  );
END $$;
