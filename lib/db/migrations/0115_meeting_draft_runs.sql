-- One row per "Draft from this meeting" run, written whether it works or
-- not.
--
-- The failure this catches is silence. Drafting runs in a Netlify
-- Background Function, which returns 202 the instant it is queued and
-- then runs alone for up to fifteen minutes. Every failure inside it —
-- Fireflies returning nothing, the Claude call erroring, the extractor's
-- output failing to parse — went to `console.error` in a Netlify log
-- nobody reads, and the page just went on saying nothing had landed.
--
-- So "the transcript produced no commitments", "the model call failed"
-- and "the job never started" were one observation from the Business
-- Builder's side: press the button, wait, get nothing. Measured on
-- Crown and Ember's 30 Jul session — synced, 66 minutes long, summary
-- present, zero drafts, and no record anywhere of why.
--
-- Same doctrine as `ea_job_runs` (0088): a job whose only symptom is an
-- absence needs somewhere to say it ran and what happened. Unlike that
-- table this one IS tenant data — it is about one client's meeting and
-- is rendered on that client's workspace — so it carries `org_id` and
-- the standard RLS policy rather than being reachable only by system
-- context.

CREATE TABLE IF NOT EXISTS meeting_draft_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- Cascade: a run is a fact about a meeting and means nothing without
  -- it. Deleting the meeting takes its run history with it.
  engagement_meeting_id uuid NOT NULL
    REFERENCES engagement_meetings(id) ON DELETE CASCADE,
  -- running | succeeded | failed. Text rather than an enum: this is
  -- operational detail with no foreign readers, and an enum would need
  -- its own migration file every time a state is added.
  status text NOT NULL DEFAULT 'running',
  items_created integer NOT NULL DEFAULT 0,
  documents_queued integer NOT NULL DEFAULT 0,
  -- The actual reason, in the operator's words rather than a log line.
  error_text text,
  -- Who pressed it. Nullable because the hourly auto-attach path drafts
  -- with no signed-in user.
  started_by_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The workspace only ever wants the LATEST run for one meeting, so the
-- index leads with the meeting and orders by start time descending.
CREATE INDEX IF NOT EXISTS meeting_draft_runs_meeting_idx
  ON meeting_draft_runs (engagement_meeting_id, started_at DESC);
CREATE INDEX IF NOT EXISTS meeting_draft_runs_org_idx
  ON meeting_draft_runs (org_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'meeting_draft_runs_set_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER meeting_draft_runs_set_updated_at
      BEFORE UPDATE ON meeting_draft_runs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END
$$;

ALTER TABLE meeting_draft_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_draft_runs_tenant ON meeting_draft_runs;
CREATE POLICY meeting_draft_runs_tenant
  ON meeting_draft_runs
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_draft_runs TO workplaces_app;
