-- 0028_subscription_catalogue.sql
-- Bruce's catalogue of services he sells as subscriptions (Netlify-hosted
-- apps, automation builds, retainers, etc.). Lives at the master-org
-- level. Existing subscription_assets get an optional product_id so we
-- can track which catalogue entry they came from.

CREATE TABLE IF NOT EXISTS "subscription_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "vendor" text NOT NULL DEFAULT 'Workplaces',
  "description" text,
  "default_monthly_cents" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'CAD',
  "category" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_by_user_profile_id" uuid REFERENCES "user_profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "subscription_products_org_idx" ON "subscription_products"("org_id");

ALTER TABLE "subscription_products" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "subscription_products_tenant_select"
    ON "subscription_products" FOR SELECT
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "subscription_products_tenant_insert"
    ON "subscription_products" FOR INSERT
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "subscription_products_tenant_update"
    ON "subscription_products" FOR UPDATE
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "subscription_products_tenant_delete"
    ON "subscription_products" FOR DELETE
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER "subscription_products_set_updated_at"
    BEFORE UPDATE ON "subscription_products"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Link existing subscription_assets to catalogue products (optional —
-- existing rows stay unlinked; new ones can be created from a product
-- or stay one-off).
ALTER TABLE "subscription_assets"
  ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "subscription_products"("id") ON DELETE SET NULL;
