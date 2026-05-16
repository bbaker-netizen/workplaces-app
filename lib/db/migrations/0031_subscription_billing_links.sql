-- Phase 5 — link subscription assets + products to the billing system
-- where they actually charge (QuickBooks Online or Stripe), so Bruce can
-- click through from the asset row to the invoice / subscription that
-- generates the monthly revenue. Idempotent: every column add is gated
-- on information_schema to be safe on environments where this already
-- ran by hand.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_assets' AND column_name = 'billing_provider'
  ) THEN
    ALTER TABLE subscription_assets
      ADD COLUMN billing_provider text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_assets' AND column_name = 'qbo_invoice_id'
  ) THEN
    ALTER TABLE subscription_assets
      ADD COLUMN qbo_invoice_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_assets' AND column_name = 'qbo_customer_id'
  ) THEN
    ALTER TABLE subscription_assets
      ADD COLUMN qbo_customer_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_assets' AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE subscription_assets
      ADD COLUMN stripe_subscription_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_assets' AND column_name = 'stripe_price_id'
  ) THEN
    ALTER TABLE subscription_assets
      ADD COLUMN stripe_price_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_assets' AND column_name = 'billing_external_url'
  ) THEN
    ALTER TABLE subscription_assets
      ADD COLUMN billing_external_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_products' AND column_name = 'default_stripe_price_id'
  ) THEN
    ALTER TABLE subscription_products
      ADD COLUMN default_stripe_price_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_products' AND column_name = 'default_qbo_item_id'
  ) THEN
    ALTER TABLE subscription_products
      ADD COLUMN default_qbo_item_id text;
  END IF;
END $$;
