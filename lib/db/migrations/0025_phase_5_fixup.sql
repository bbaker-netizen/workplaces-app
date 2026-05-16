-- 0025_phase_5_fixup.sql
--
-- Defensive consolidation for the Phase-5 schema bits (originally
-- migrations 0021–0024). The earlier files were missing the
-- `--> statement-breakpoint` markers that Drizzle's migrator uses to
-- split multi-statement SQL files; in production the runner appears
-- to have executed only the first statement of each file and marked
-- the whole file as applied, so tables / columns / policies after
-- statement #1 never landed.
--
-- This migration is idempotent — every change uses `IF NOT EXISTS` or
-- guards in DO blocks — so it's safe to run against a database whether
-- the prior migrations succeeded fully, partially, or not at all.

-- ============================================================
-- 0021_user_ui_prefs  — per-user UI preferences
-- ============================================================
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "pinned_nav_items" text[] NOT NULL DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "sidebar_collapsed" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "pipeline_column_prefs" jsonb;--> statement-breakpoint
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "home_dashboard_layout" jsonb;--> statement-breakpoint

-- ============================================================
-- 0022_google_calendar  — Google Calendar OAuth tokens + per-session mapping
-- ============================================================
CREATE TABLE IF NOT EXISTS "google_calendar_tokens" (
  "user_profile_id" uuid PRIMARY KEY REFERENCES "user_profiles"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "refresh_token_encrypted" text NOT NULL,
  "access_token_encrypted" text,
  "access_token_expires_at" timestamptz,
  "scope" text NOT NULL,
  "calendar_id" text NOT NULL DEFAULT 'primary',
  "google_email" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "google_calendar_tokens_org_idx" ON "google_calendar_tokens"("org_id");--> statement-breakpoint

ALTER TABLE "google_calendar_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "google_calendar_tokens_owner_select"
    ON "google_calendar_tokens" FOR SELECT
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "google_calendar_tokens_owner_insert"
    ON "google_calendar_tokens" FOR INSERT
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "google_calendar_tokens_owner_update"
    ON "google_calendar_tokens" FOR UPDATE
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "google_calendar_tokens_owner_delete"
    ON "google_calendar_tokens" FOR DELETE
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TRIGGER "google_calendar_tokens_set_updated_at"
    BEFORE UPDATE ON "google_calendar_tokens"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "google_calendar_event_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "bbs_session_id" uuid NOT NULL REFERENCES "bbs_sessions"("id") ON DELETE CASCADE,
  "user_profile_id" uuid NOT NULL REFERENCES "user_profiles"("id") ON DELETE CASCADE,
  "google_event_id" text NOT NULL,
  "google_calendar_id" text NOT NULL,
  "last_synced_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "google_calendar_event_mappings_org_idx" ON "google_calendar_event_mappings"("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_calendar_event_mappings_session_idx" ON "google_calendar_event_mappings"("bbs_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "google_calendar_event_mappings_uniq" ON "google_calendar_event_mappings"("bbs_session_id","user_profile_id");--> statement-breakpoint

ALTER TABLE "google_calendar_event_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "google_calendar_event_mappings_tenant_select"
    ON "google_calendar_event_mappings" FOR SELECT
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "google_calendar_event_mappings_tenant_insert"
    ON "google_calendar_event_mappings" FOR INSERT
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "google_calendar_event_mappings_tenant_update"
    ON "google_calendar_event_mappings" FOR UPDATE
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "google_calendar_event_mappings_tenant_delete"
    ON "google_calendar_event_mappings" FOR DELETE
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TRIGGER "google_calendar_event_mappings_set_updated_at"
    BEFORE UPDATE ON "google_calendar_event_mappings"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ============================================================
-- 0023_client_communications  — unified comms log + aliases
-- ============================================================
DO $$ BEGIN
  CREATE TYPE communication_channel AS ENUM (
    'email', 'sms', 'whatsapp', 'phone_call', 'meeting_note', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE communication_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "client_communications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "prospect_id" uuid REFERENCES "prospects"("id") ON DELETE CASCADE,
  "engagement_id" uuid REFERENCES "engagements"("id") ON DELETE CASCADE,
  "channel" communication_channel NOT NULL,
  "direction" communication_direction NOT NULL,
  "from_address" text,
  "to_addresses" text[] NOT NULL DEFAULT '{}'::text[],
  "subject" text,
  "body" text NOT NULL DEFAULT '',
  "body_html" text,
  "thread_key" text,
  "external_id" text,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "created_by_user_profile_id" uuid REFERENCES "user_profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (
    ("prospect_id" IS NOT NULL AND "engagement_id" IS NULL)
    OR ("prospect_id" IS NULL AND "engagement_id" IS NOT NULL)
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_communications_org_idx" ON "client_communications"("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_communications_prospect_idx" ON "client_communications"("prospect_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_communications_engagement_idx" ON "client_communications"("engagement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_communications_occurred_idx" ON "client_communications"("occurred_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_communications_external_uniq"
  ON "client_communications"("org_id","channel","external_id")
  WHERE "external_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "client_communications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "client_communications_tenant_select"
    ON "client_communications" FOR SELECT
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "client_communications_tenant_insert"
    ON "client_communications" FOR INSERT
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "client_communications_tenant_update"
    ON "client_communications" FOR UPDATE
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "client_communications_tenant_delete"
    ON "client_communications" FOR DELETE
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TRIGGER "client_communications_set_updated_at"
    BEFORE UPDATE ON "client_communications"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "alias" text NOT NULL UNIQUE,
  "prospect_id" uuid REFERENCES "prospects"("id") ON DELETE CASCADE,
  "engagement_id" uuid REFERENCES "engagements"("id") ON DELETE CASCADE,
  "created_by_user_profile_id" uuid REFERENCES "user_profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (
    ("prospect_id" IS NOT NULL AND "engagement_id" IS NULL)
    OR ("prospect_id" IS NULL AND "engagement_id" IS NOT NULL)
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "communication_aliases_org_idx" ON "communication_aliases"("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_aliases_prospect_idx" ON "communication_aliases"("prospect_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communication_aliases_engagement_idx" ON "communication_aliases"("engagement_id");--> statement-breakpoint

ALTER TABLE "communication_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "communication_aliases_tenant_select"
    ON "communication_aliases" FOR SELECT
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "communication_aliases_tenant_insert"
    ON "communication_aliases" FOR INSERT
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "communication_aliases_tenant_update"
    ON "communication_aliases" FOR UPDATE
    USING (org_id = auth.org_id())
    WITH CHECK (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "communication_aliases_tenant_delete"
    ON "communication_aliases" FOR DELETE
    USING (org_id = auth.org_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TRIGGER "communication_aliases_set_updated_at"
    BEFORE UPDATE ON "communication_aliases"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ============================================================
-- 0024_gmail_sync_watermark  — Gmail sync columns on tokens
-- ============================================================
ALTER TABLE "google_calendar_tokens"
  ADD COLUMN IF NOT EXISTS "gmail_sync_enabled" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "google_calendar_tokens"
  ADD COLUMN IF NOT EXISTS "gmail_last_synced_at" timestamptz;--> statement-breakpoint
ALTER TABLE "google_calendar_tokens"
  ADD COLUMN IF NOT EXISTS "gmail_last_message_at" timestamptz;--> statement-breakpoint

-- ============================================================
-- Grant runtime-role permissions on the new tables so the
-- workplaces_app role can SELECT / INSERT / UPDATE / DELETE.
-- Earlier migrations granted these per-table on creation; bring the
-- Phase-5 tables to parity.
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON "google_calendar_tokens" TO workplaces_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "google_calendar_event_mappings" TO workplaces_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "client_communications" TO workplaces_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "communication_aliases" TO workplaces_app;
