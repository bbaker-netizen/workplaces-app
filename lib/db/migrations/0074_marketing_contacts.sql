-- Marketing contacts — a list separate from the sales pipeline. These are
-- cold/old contacts (e.g. imported from the WordPress / Formidable forms on
-- 4workplaces.com) used for marketing, NOT active sales prospects. Kept in
-- their own table so they can never pollute the pipeline board, the funnel,
-- or the Reports conversion math. De-duped by email within the org.
CREATE TABLE IF NOT EXISTS "marketing_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "phone" text,
  "company" text,
  -- where the contact came from — defaults to WordPress since that's the
  -- first import source, but any label is valid.
  "source" text DEFAULT 'WordPress' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  -- marketing opt-in; future unsubscribe flips this to false.
  "subscribed" boolean DEFAULT true NOT NULL,
  -- set when this email also exists as a pipeline prospect, so we can show
  -- "already in your pipeline" without a live join every render.
  "matched_prospect_id" uuid,
  "created_by_user_profile_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "marketing_contacts" ADD CONSTRAINT "marketing_contacts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "marketing_contacts" ADD CONSTRAINT "marketing_contacts_matched_prospect_id_prospects_id_fk" FOREIGN KEY ("matched_prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "marketing_contacts" ADD CONSTRAINT "marketing_contacts_created_by_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("created_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- One row per email per org — the import upserts on this to de-dupe.
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_contacts_org_email_uniq" ON "marketing_contacts" USING btree ("org_id", lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketing_contacts_org_idx" ON "marketing_contacts" USING btree ("org_id","created_at");--> statement-breakpoint
DROP TRIGGER IF EXISTS marketing_contacts_set_updated_at ON "marketing_contacts";--> statement-breakpoint
CREATE TRIGGER marketing_contacts_set_updated_at BEFORE UPDATE ON "marketing_contacts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "marketing_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "marketing_contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "marketing_contacts_tenant_isolation" ON "marketing_contacts";--> statement-breakpoint
CREATE POLICY "marketing_contacts_tenant_isolation" ON "marketing_contacts"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
