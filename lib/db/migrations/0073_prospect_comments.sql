-- Internal Business Builder comments on a prospect / client. Private to
-- the practice (master_admin + coach) — never shown in the client portal.
-- A comment can @notify one or more teammates, who get an in-app
-- notification + an email. Lives in the master org like every other
-- prospect-scoped record, so the existing tenant queries pick it up.
CREATE TABLE IF NOT EXISTS "prospect_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "prospect_id" uuid NOT NULL,
  "author_user_profile_id" uuid,
  "body" text NOT NULL,
  -- teammates the author chose to notify on this comment (jsonb array of
  -- user_profiles.id) — kept for auditing who was pinged.
  "notified_user_profile_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prospect_comments" ADD CONSTRAINT "prospect_comments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prospect_comments" ADD CONSTRAINT "prospect_comments_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prospect_comments" ADD CONSTRAINT "prospect_comments_author_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("author_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prospect_comments_prospect_idx" ON "prospect_comments" USING btree ("prospect_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prospect_comments_org_idx" ON "prospect_comments" USING btree ("org_id");--> statement-breakpoint
-- Shared updated_at trigger (set_updated_at() defined in migration 0000).
DROP TRIGGER IF EXISTS prospect_comments_set_updated_at ON "prospect_comments";--> statement-breakpoint
CREATE TRIGGER prospect_comments_set_updated_at BEFORE UPDATE ON "prospect_comments" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- RLS — same tenant-isolation pattern as every other tenant-scoped table.
ALTER TABLE "prospect_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_comments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "prospect_comments_tenant_isolation" ON "prospect_comments";--> statement-breakpoint
CREATE POLICY "prospect_comments_tenant_isolation" ON "prospect_comments"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
