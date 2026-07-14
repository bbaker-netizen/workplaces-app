-- Disqualification reason + timestamp for "Not qualified" leads.
--
-- Not-qualified leads are a marketing lead-QUALITY signal, not a sales
-- performance signal. We pull them out of the conversion / funnel / time-to-
-- close stats and report them separately (Reports → Marketing Lead Quality),
-- broken down by reason and by source. These two columns capture the WHY and
-- the WHEN so that section is actionable.
--
-- Both columns nullable, guards IF NOT EXISTS — safe to re-run (the
-- migrate-on-deploy runner also tracks applied files in _app_migrations).

ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "disqualified_reason" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "disqualified_at" timestamptz;
