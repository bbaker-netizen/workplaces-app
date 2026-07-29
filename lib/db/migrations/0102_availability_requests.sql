-- Recurring-meeting availability, collected from the client.
--
-- Replaces the Google Form in the onboarding email. The point of bringing it
-- in-house is that the answer lands ON the client's record automatically —
-- the old form meant someone read an email and re-keyed the times, which is
-- exactly the manual step the onboarding workflow is meant to remove.
--
-- ONE row per request, holding both the invitation and the answer. A separate
-- responses table would buy nothing: a request has at most one response, and
-- keeping them together means "sent but not answered" is simply
-- submitted_at IS NULL rather than an outer join.
--
-- `public_token` is the auth, same standard as the signing links: a random
-- 32-char base64url string, emailed only to that client. Clients have no
-- login, so a token is the only thing that can gate this.
--
-- `slots` is jsonb — an array of {day, period} pairs like
-- [{"day":"mon","period":"morning"}]. Not a column per weekday-half, because
-- the grid's shape is presentation, and a fixed ten columns would need a
-- migration the first time Saturday or an evening slot is wanted.
CREATE TABLE IF NOT EXISTS availability_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  prospect_id       uuid REFERENCES prospects(id) ON DELETE CASCADE,
  engagement_id     uuid REFERENCES engagements(id) ON DELETE CASCADE,
  public_token      text NOT NULL UNIQUE,
  -- Who we asked, so the confirmation and the notification can name them.
  contact_name      text,
  contact_email     text,
  -- The answer.
  slots             jsonb,
  note              text,
  submitted_at      timestamptz,
  submitted_ip      text,
  created_by_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS availability_requests_org_idx
  ON availability_requests (org_id);
CREATE INDEX IF NOT EXISTS availability_requests_prospect_idx
  ON availability_requests (prospect_id);
CREATE INDEX IF NOT EXISTS availability_requests_engagement_idx
  ON availability_requests (engagement_id);

CREATE TRIGGER set_updated_at_availability_requests
  BEFORE UPDATE ON availability_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Same RLS shape as every other tenant-scoped table.
ALTER TABLE availability_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS availability_requests_tenant ON availability_requests;
CREATE POLICY availability_requests_tenant ON availability_requests
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
