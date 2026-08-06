-- The Person Profile assessment becomes step 4 of onboarding.
--
-- It used to live as a hand-ticked panel on the PROSPECT, which put it in
-- the wrong half of the relationship: nobody sits a Person Profile while
-- they are still deciding whether to hire you. It belongs to the client
-- who has signed, alongside the welcome email, the payment form and the
-- portal invite, and it belongs in the same sequence so it cannot be the
-- one step that gets forgotten.
--
-- Its own timestamp and error column, like every other step, for the
-- reason set out in 0108: an email that has already left cannot be
-- un-sent, so the record has to say exactly how far the run got.
ALTER TABLE onboarding_runs
  ADD COLUMN IF NOT EXISTS assessment_sent_at timestamptz;
ALTER TABLE onboarding_runs
  ADD COLUMN IF NOT EXISTS assessment_error   text;

-- Where the assessment lives, per practice rather than per engagement.
--
-- TTI issues one survey link per hiring or coaching context, with no
-- per-person identity in it — which is why completion is still ticked by
-- hand. Hard-coding that link in application code has already gone wrong
-- once in a Make scenario, where it sat inside an email body and could
-- only be changed by someone who knew the scenario existed.
--
-- Nullable on purpose. With no link configured the onboarding sequence
-- SKIPS this step and records why, rather than emailing a new client a
-- broken button on their first day.
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS person_profile_assessment_url text;
