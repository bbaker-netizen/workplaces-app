-- 0065: Business Builder access control.
--
-- Lets a master_admin limit other Business Builders to specific clients
-- and specific console modules. Additive and fully idempotent; the
-- defaults preserve existing behaviour (every Business Builder keeps
-- access to all clients and all modules until a master_admin dials it
-- back). master_admin always bypasses these checks in app logic.

ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "all_clients_access" boolean NOT NULL DEFAULT true;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "allowed_console_modules" jsonb;

CREATE TABLE IF NOT EXISTS "bb_client_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "coach_user_profile_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "bb_client_access" ADD CONSTRAINT "bb_client_access_org_id_orgs_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "bb_client_access" ADD CONSTRAINT "bb_client_access_coach_user_profile_id_user_profiles_id_fk"
    FOREIGN KEY ("coach_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "bb_client_access" ADD CONSTRAINT "bb_client_access_engagement_id_engagements_id_fk"
    FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "bb_client_access_org_idx" ON "bb_client_access" USING btree ("org_id");
CREATE INDEX IF NOT EXISTS "bb_client_access_coach_idx" ON "bb_client_access" USING btree ("coach_user_profile_id");
CREATE UNIQUE INDEX IF NOT EXISTS "bb_client_access_coach_engagement_unique" ON "bb_client_access" USING btree ("coach_user_profile_id","engagement_id");

DROP TRIGGER IF EXISTS bb_client_access_set_updated_at ON "bb_client_access";
CREATE TRIGGER bb_client_access_set_updated_at BEFORE UPDATE ON "bb_client_access" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE "bb_client_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bb_client_access" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bb_client_access_tenant_isolation" ON "bb_client_access";
CREATE POLICY "bb_client_access_tenant_isolation" ON "bb_client_access"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
