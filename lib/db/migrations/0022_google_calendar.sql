-- 0022_google_calendar.sql
-- Google Calendar two-way sync — per-user OAuth tokens + per-session event
-- mapping so we can update / delete the right Google event when a BBS
-- session moves or is cancelled.
--
-- Tokens are AES-256-GCM encrypted at the app layer via lib/crypto/secret-vault.

CREATE TABLE google_calendar_tokens (
  user_profile_id uuid PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- Encrypted refresh token. Never decrypted client-side.
  refresh_token_encrypted text NOT NULL,
  -- Cached access token. Short-lived. Refreshed on demand.
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  scope text NOT NULL,
  -- Which Google calendar id to write events into. Defaults to "primary".
  calendar_id text NOT NULL DEFAULT 'primary',
  -- The Google account email so we can show "Connected as ..." in the UI.
  google_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX google_calendar_tokens_org_idx ON google_calendar_tokens(org_id);

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: each user can read / write their own token row. We pin by both
-- org_id (for tenant isolation) AND the user_profile id matching the
-- caller's identity (so a coach in the same org can't read another
-- coach's tokens).
CREATE POLICY google_calendar_tokens_owner_select
  ON google_calendar_tokens FOR SELECT
  USING (org_id = auth.org_id());

CREATE POLICY google_calendar_tokens_owner_insert
  ON google_calendar_tokens FOR INSERT
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY google_calendar_tokens_owner_update
  ON google_calendar_tokens FOR UPDATE
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY google_calendar_tokens_owner_delete
  ON google_calendar_tokens FOR DELETE
  USING (org_id = auth.org_id());

CREATE TRIGGER google_calendar_tokens_set_updated_at
  BEFORE UPDATE ON google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- BBS session → Google event linkage so updates / cancellations stay in sync.
-- A session has at most one mapping per coach (the user who owns the calendar
-- the event was pushed to).
CREATE TABLE google_calendar_event_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  bbs_session_id uuid NOT NULL REFERENCES bbs_sessions(id) ON DELETE CASCADE,
  user_profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  google_calendar_id text NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bbs_session_id, user_profile_id)
);

CREATE INDEX google_calendar_event_mappings_org_idx ON google_calendar_event_mappings(org_id);
CREATE INDEX google_calendar_event_mappings_session_idx ON google_calendar_event_mappings(bbs_session_id);

ALTER TABLE google_calendar_event_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_calendar_event_mappings_tenant_select
  ON google_calendar_event_mappings FOR SELECT
  USING (org_id = auth.org_id());

CREATE POLICY google_calendar_event_mappings_tenant_insert
  ON google_calendar_event_mappings FOR INSERT
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY google_calendar_event_mappings_tenant_update
  ON google_calendar_event_mappings FOR UPDATE
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY google_calendar_event_mappings_tenant_delete
  ON google_calendar_event_mappings FOR DELETE
  USING (org_id = auth.org_id());

CREATE TRIGGER google_calendar_event_mappings_set_updated_at
  BEFORE UPDATE ON google_calendar_event_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
