-- Google Calendar owns the internal touch-base schedule.
--
-- Per Bruce's call: the recurring touch-base lives in Google Calendar
-- (where he already keeps it), and The Builder READS it in rather than
-- generating its own event. This makes a session_series able to be
-- either "app" (cadence-generated, the original 0084 model) or "google"
-- (linked to a recurring Google event, occurrences pulled in).
--
-- App-source columns (cadence, anchor_at) become nullable because a
-- google-source series doesn't use them — Google is the source of truth
-- for timing.

DO $$ BEGIN
  CREATE TYPE "public"."session_series_source" AS ENUM('app', 'google');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "session_series"
  ADD COLUMN IF NOT EXISTS "source" "session_series_source" DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_series"
  ADD COLUMN IF NOT EXISTS "google_calendar_id" text;--> statement-breakpoint
ALTER TABLE "session_series"
  ADD COLUMN IF NOT EXISTS "google_recurring_event_id" text;--> statement-breakpoint
-- Whose connected Google account the linked event lives on. The sync job
-- reads occurrences using this user's token. SET NULL if they leave.
ALTER TABLE "session_series"
  ADD COLUMN IF NOT EXISTS "linked_by_user_profile_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_series" ADD CONSTRAINT "session_series_linked_by_user_profile_id_fk"
    FOREIGN KEY ("linked_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- Google-source rows leave cadence + anchor_at null; only app-source
-- rows populate them. Relax the 0084 NOT NULL constraints.
ALTER TABLE "session_series" ALTER COLUMN "cadence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_series" ALTER COLUMN "anchor_at" DROP NOT NULL;--> statement-breakpoint

-- One linked series per (calendar, recurring event) so re-linking the
-- same Google event can't create a second series.
CREATE UNIQUE INDEX IF NOT EXISTS "session_series_google_event_uniq"
  ON "session_series" USING btree ("google_calendar_id", "google_recurring_event_id")
  WHERE "google_recurring_event_id" IS NOT NULL;--> statement-breakpoint

-- Per-occurrence identity for google-sourced sessions. The Google
-- instance id (e.g. "<masterId>_20260721T150000Z") is stable for a given
-- occurrence, so it's the idempotency key: a re-sync updates the matching
-- session in place instead of duplicating it, and lets us detect a moved
-- or cancelled occurrence.
ALTER TABLE "bbs_sessions"
  ADD COLUMN IF NOT EXISTS "google_instance_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bbs_sessions_google_instance_uniq"
  ON "bbs_sessions" USING btree ("series_id", "google_instance_id")
  WHERE "google_instance_id" IS NOT NULL;
