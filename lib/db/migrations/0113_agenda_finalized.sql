-- Finalizing an agenda.
--
-- Until now an agenda had no point at which it was declared ready. Points
-- accumulated, and the only prompt to go and read them was the 07:00
-- briefing on the morning of the session — too late to prepare properly,
-- and nothing at all if the session was not today.
--
-- `agenda_finalized_at` is deliberately BOTH the state flag and the
-- watermark. It records the moment the agenda was last announced, which
-- is exactly the line to compare item timestamps against when working out
-- what has changed since the other person last read it. A separate
-- revision counter would have to be kept in step with this timestamp and
-- could drift out of it; one column cannot disagree with itself.
--
--   NULL      → never finalized. No email has gone out.
--   set       → announced at that moment. Anything in `agenda_items` with
--               created_at/updated_at after it is unannounced change.
--
-- Re-finalizing moves the watermark forward, so each email describes only
-- what happened since the last one.
--
-- Note the one thing this cannot see: an item DELETED since the last
-- finalize leaves no row to compare, so a removal alone does not count as
-- a change. Adding a tombstone for that would cost a table to catch a case
-- that reads as "we dropped a topic", which nobody needs an email about.
--
-- `..._by_user_profile_id` is ON DELETE SET NULL, not CASCADE: who pressed
-- the button is provenance, and losing a departed Builder's profile must
-- not silently un-finalize a live agenda.

ALTER TABLE "bbs_sessions"
  ADD COLUMN IF NOT EXISTS "agenda_finalized_at" timestamptz;

ALTER TABLE "bbs_sessions"
  ADD COLUMN IF NOT EXISTS "agenda_finalized_by_user_profile_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bbs_sessions_agenda_finalized_by_fk'
  ) THEN
    ALTER TABLE "bbs_sessions"
      ADD CONSTRAINT "bbs_sessions_agenda_finalized_by_fk"
      FOREIGN KEY ("agenda_finalized_by_user_profile_id")
      REFERENCES "user_profiles"("id") ON DELETE SET NULL;
  END IF;
END $$;
