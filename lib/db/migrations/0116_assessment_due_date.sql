-- When the client's Person Profile assessments are due back.
--
-- The date was referenced in the onboarding checklist ("so the onboarding
-- email carries a real assessment deadline") and stored nowhere. There
-- was no column, no control, and nothing in the email — the deadline
-- existed only as a sentence telling the operator that a deadline
-- existed.
--
-- A `date`, not a timestamp: this is a day the client is working to, not
-- a moment. Nullable, because it only applies once assessments are part
-- of the engagement, and every client onboarded before this has none.
--
-- Deliberately on the engagement rather than on `person_profiles`. The
-- deadline is one date for the whole client — "get your team's
-- assessments back by the 14th" — set once at onboarding and quoted in
-- one email. Per-person dates would have to be kept in step with each
-- other to say the same thing, and nothing in the flow ever wants them
-- to differ.

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS assessment_due_date date;
