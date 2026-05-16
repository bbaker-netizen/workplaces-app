-- 0023_client_communications.sql
-- Unified client-communications log. Captures email / SMS / WhatsApp /
-- phone-call notes against either a prospect (pre-engagement) or an
-- engagement (post-engagement). Searchable + taggable.
--
-- Why a new table and not piggyback on `prospect_activities`?
-- prospect_activities is a per-prospect audit trail; once a prospect
-- becomes an engagement, future comms should attach to the engagement
-- row. A single table that takes EITHER a prospect_id OR an engagement_id
-- lets the audit follow the relationship through its lifecycle.

CREATE TYPE communication_channel AS ENUM (
  'email',
  'sms',
  'whatsapp',
  'phone_call',
  'meeting_note',
  'other'
);

CREATE TYPE communication_direction AS ENUM ('inbound', 'outbound');

CREATE TABLE client_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES engagements(id) ON DELETE CASCADE,
  channel communication_channel NOT NULL,
  direction communication_direction NOT NULL,
  -- Who sent / received. For email/sms/whatsapp the addresses; for
  -- phone_call free-form names; for meeting_note the attendee list.
  from_address text,
  to_addresses text[] NOT NULL DEFAULT '{}'::text[],
  subject text,
  body text NOT NULL DEFAULT '',
  body_html text,
  -- Grouping key — e.g., email message-id threading, SMS sender number.
  thread_key text,
  -- Provider's message id (Resend / Twilio / etc.) so re-runs don't dupe.
  external_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  created_by_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Either a prospect or an engagement, never both.
  CHECK (
    (prospect_id IS NOT NULL AND engagement_id IS NULL)
    OR (prospect_id IS NULL AND engagement_id IS NOT NULL)
  )
);

CREATE INDEX client_communications_org_idx ON client_communications(org_id);
CREATE INDEX client_communications_prospect_idx ON client_communications(prospect_id);
CREATE INDEX client_communications_engagement_idx ON client_communications(engagement_id);
CREATE INDEX client_communications_occurred_idx ON client_communications(occurred_at DESC);
CREATE UNIQUE INDEX client_communications_external_uniq
  ON client_communications(org_id, channel, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE client_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_communications_tenant_select
  ON client_communications FOR SELECT
  USING (org_id = auth.org_id());

CREATE POLICY client_communications_tenant_insert
  ON client_communications FOR INSERT
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY client_communications_tenant_update
  ON client_communications FOR UPDATE
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY client_communications_tenant_delete
  ON client_communications FOR DELETE
  USING (org_id = auth.org_id());

CREATE TRIGGER client_communications_set_updated_at
  BEFORE UPDATE ON client_communications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-engagement / per-prospect BCC alias. When Bruce BCCs
-- "lead-acme-9af2@inbound.4workplaces.com" on any email, the inbound
-- webhook resolves the alias and attaches the message to that prospect
-- / engagement.
CREATE TABLE communication_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE,
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES engagements(id) ON DELETE CASCADE,
  created_by_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (prospect_id IS NOT NULL AND engagement_id IS NULL)
    OR (prospect_id IS NULL AND engagement_id IS NOT NULL)
  )
);

CREATE INDEX communication_aliases_org_idx ON communication_aliases(org_id);
CREATE INDEX communication_aliases_prospect_idx ON communication_aliases(prospect_id);
CREATE INDEX communication_aliases_engagement_idx ON communication_aliases(engagement_id);

ALTER TABLE communication_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY communication_aliases_tenant_select
  ON communication_aliases FOR SELECT
  USING (org_id = auth.org_id());

CREATE POLICY communication_aliases_tenant_insert
  ON communication_aliases FOR INSERT
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY communication_aliases_tenant_update
  ON communication_aliases FOR UPDATE
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY communication_aliases_tenant_delete
  ON communication_aliases FOR DELETE
  USING (org_id = auth.org_id());

CREATE TRIGGER communication_aliases_set_updated_at
  BEFORE UPDATE ON communication_aliases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
