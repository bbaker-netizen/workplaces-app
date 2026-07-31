-- "Start onboarding" — one button, three sends, recorded.
--
-- Replaces three manual steps a Builder did by hand in sequence: the
-- onboarding email, the pre-authorized debit form, and the portal
-- invitation. Doing them by hand meant they could be done out of order,
-- twice, or half-done and forgotten, and nothing on the record said which
-- of those had happened.
--
-- **One row per engagement, UNIQUE.** That constraint is the entire
-- double-fire guard: a second press hits the unique violation and is told
-- onboarding has already started, rather than sending a client their
-- welcome email twice. It is enforced by the database and not by a check
-- in the action, because two clicks a second apart would both pass a
-- check-then-insert.
--
-- **A column per step, not a single status.** The three sends cannot be
-- undone once they leave, so the failure that matters is the partial one:
-- two went, the third did not. A single `status` column cannot express
-- that, and a Builder looking at "failed" would have no way to know
-- whether the client had already been emailed. Each step records its own
-- timestamp and its own error, so the record always says exactly how far
-- it got and the remaining steps can be resumed without repeating the
-- ones that landed.
--
-- The staggering (a couple of minutes between sends, so the client does
-- not get three emails at once) happens in a Netlify Background Function,
-- which has a 15-minute budget. It deliberately does NOT use a cron: a
-- schedule frequent enough for a two-minute gap would run all day for
-- something that happens a handful of times a month.

CREATE TABLE IF NOT EXISTS onboarding_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- UNIQUE: the double-fire guard. See above.
  engagement_id     uuid NOT NULL UNIQUE REFERENCES engagements(id) ON DELETE CASCADE,
  -- Whose Gmail the onboarding email sends from, and whose Clerk identity
  -- creates the client's organisation. Resolved from this row rather than
  -- from a session, because the sequence runs in a background function
  -- where there is no signed-in user.
  started_by_user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),

  -- Step 1 — onboarding email, from the Builder's own Gmail.
  welcome_email_sent_at   timestamptz,
  welcome_email_error     text,
  -- Step 2 — pre-authorized debit form for signature.
  pad_sent_at             timestamptz,
  pad_error               text,
  -- Step 3 — portal invitation. Last on purpose: it drops the client
  -- into their workspace, and that must not happen before the modules
  -- and the Soul File are ready.
  portal_invite_sent_at   timestamptz,
  portal_invite_error     text,

  -- Set only when all three landed.
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_runs_org_idx
  ON onboarding_runs (org_id);
CREATE INDEX IF NOT EXISTS onboarding_runs_engagement_idx
  ON onboarding_runs (engagement_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_onboarding_runs'
  ) THEN
    CREATE TRIGGER set_updated_at_onboarding_runs
      BEFORE UPDATE ON onboarding_runs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Same RLS shape as every other tenant-scoped table.
ALTER TABLE onboarding_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_runs_tenant ON onboarding_runs;
CREATE POLICY onboarding_runs_tenant ON onboarding_runs
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
