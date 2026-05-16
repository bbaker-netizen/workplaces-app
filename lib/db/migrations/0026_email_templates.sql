-- 0026_email_templates.sql
-- Reusable email templates Bruce builds once, sends to many.
-- Used for onboarding, contracts, proposals, follow-ups, etc.
-- Bodies support {{variable}} interpolation against the prospect
-- or engagement context at send time.

CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'other',
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "created_by_user_profile_id" uuid REFERENCES "user_profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "email_templates_org_idx" ON "email_templates"("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_category_idx" ON "email_templates"("org_id","category");--> statement-breakpoint

ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "email_templates_tenant_select"
    ON "email_templates" FOR SELECT
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "email_templates_tenant_insert"
    ON "email_templates" FOR INSERT
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "email_templates_tenant_update"
    ON "email_templates" FOR UPDATE
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "email_templates_tenant_delete"
    ON "email_templates" FOR DELETE
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TRIGGER "email_templates_set_updated_at"
    BEFORE UPDATE ON "email_templates"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;
