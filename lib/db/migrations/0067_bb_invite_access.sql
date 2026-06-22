-- 0067: pre-set access for invited Business Builders.
--
-- Lets a master admin choose an invitee's client + module access at invite
-- time (before they have an account). Keyed by email; applied to their
-- user_profile the moment they accept and sign up, then the row is deleted.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS "bb_invite_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "email" text NOT NULL,
  "all_clients_access" boolean NOT NULL DEFAULT true,
  "allowed_console_modules" jsonb,
  "granted_engagement_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "bb_invite_access" ADD CONSTRAINT "bb_invite_access_org_id_orgs_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "bb_invite_access_org_email_unique"
  ON "bb_invite_access" USING btree ("org_id", lower("email"));
CREATE INDEX IF NOT EXISTS "bb_invite_access_org_idx" ON "bb_invite_access" USING btree ("org_id");

DROP TRIGGER IF EXISTS bb_invite_access_set_updated_at ON "bb_invite_access";
CREATE TRIGGER bb_invite_access_set_updated_at BEFORE UPDATE ON "bb_invite_access" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE "bb_invite_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bb_invite_access" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bb_invite_access_tenant_isolation" ON "bb_invite_access";
CREATE POLICY "bb_invite_access_tenant_isolation" ON "bb_invite_access"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
