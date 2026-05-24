-- 0043: engagement_meetings — Fireflies-synced meeting records per
-- client engagement.
--
-- One row per Fireflies transcript that includes at least one
-- attendee from the engagement's org. We pull the meeting metadata
-- + Fireflies-generated summary (overview + bullets + keywords),
-- WITHOUT touching action item extraction (that pipeline already
-- exists and Bruce wants to keep it manual).
--
-- The sync upserts on fireflies_transcript_id so re-runs are
-- idempotent. last_synced_at gives the UI a "Synced X mins ago"
-- footer.

CREATE TABLE IF NOT EXISTS engagement_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs (id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements (id) ON DELETE CASCADE,
  fireflies_transcript_id text NOT NULL,
  title text NOT NULL,
  occurred_at timestamptz NOT NULL,
  duration_min integer,
  organizer_email text,
  attendees jsonb NOT NULL DEFAULT '[]',
  summary_overview text,
  summary_bullets text,
  summary_keywords text,
  transcript_url text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One row per transcript per engagement. A transcript could
  -- theoretically belong to multiple engagements if the same
  -- attendee email straddles them, so we don't UNIQUE on
  -- transcript alone.
  UNIQUE (engagement_id, fireflies_transcript_id)
);

CREATE INDEX IF NOT EXISTS engagement_meetings_org_idx
  ON engagement_meetings (org_id);
CREATE INDEX IF NOT EXISTS engagement_meetings_engagement_idx
  ON engagement_meetings (engagement_id);
CREATE INDEX IF NOT EXISTS engagement_meetings_occurred_at_idx
  ON engagement_meetings (occurred_at DESC);

-- Updated_at trigger (matches the pattern on every other tenant
-- table — see lib/db/migrations/0001_rls_policies.sql for the
-- shared set_updated_at function).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'engagement_meetings_set_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER engagement_meetings_set_updated_at
      BEFORE UPDATE ON engagement_meetings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END
$$;

-- RLS — same pattern as every other tenant-scoped table.
ALTER TABLE engagement_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engagement_meetings_tenant
  ON engagement_meetings;
CREATE POLICY engagement_meetings_tenant
  ON engagement_meetings
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON engagement_meetings
  TO workplaces_app;
