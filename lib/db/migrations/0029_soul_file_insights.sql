-- 0029_soul_file_insights.sql
-- AI-extracted insights for a Soul File. After a BBS session,
-- Bruce can ask Claude to read the session notes (eventually the
-- Fireflies transcript) and propose Soul-File-worthy observations.
-- Each one lands as a pending row; Bruce reviews, hits Accept to
-- merge into the Soul File body, or Dismiss to delete.

CREATE TABLE IF NOT EXISTS "soul_file_ai_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "soul_file_id" uuid NOT NULL REFERENCES "soul_files"("id") ON DELETE CASCADE,
  "source_session_id" uuid REFERENCES "bbs_sessions"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "accepted_at" timestamptz,
  "dismissed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "soul_file_ai_insights_org_idx" ON "soul_file_ai_insights"("org_id");
CREATE INDEX IF NOT EXISTS "soul_file_ai_insights_soul_idx" ON "soul_file_ai_insights"("soul_file_id");

ALTER TABLE "soul_file_ai_insights" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "soul_file_ai_insights_tenant_select"
    ON "soul_file_ai_insights" FOR SELECT USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "soul_file_ai_insights_tenant_insert"
    ON "soul_file_ai_insights" FOR INSERT WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "soul_file_ai_insights_tenant_update"
    ON "soul_file_ai_insights" FOR UPDATE
    USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "soul_file_ai_insights_tenant_delete"
    ON "soul_file_ai_insights" FOR DELETE USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER "soul_file_ai_insights_set_updated_at"
    BEFORE UPDATE ON "soul_file_ai_insights"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;
