-- Internal team touch-bases + generic session agendas.
--
-- Three things ship here:
--
--  1. `engagements.is_internal` — marks the practice's OWN workspace
--     engagement (Bruce + Jen + future Business Builders) so internal
--     work can be filtered OUT of client-facing console lists and INTO
--     the Team module. One per master org; the resolver in
--     lib/db/queries/internal-workspace.ts creates it on first use.
--
--  2. `session_series` + new `bbs_sessions` columns — recurring
--     schedules. A series holds the cadence (weekly / biweekly /
--     monthly) and an anchor datetime that fixes the weekday + time of
--     day; instances are materialized forward to a rolling horizon.
--     `(series_id, series_occurrence_at)` is UNIQUE, which is the whole
--     idempotency mechanism: re-running the materializer can never
--     double-create an instance.
--
--  3. `agenda_items` — deliberately generic, attached to ANY
--     bbs_session rather than internal-only, so client BBS sessions get
--     agendas from the same table with no second build. Items carry
--     forward: an undiscussed item can spawn a copy on the next
--     instance, with `carried_from_agenda_item_id` preserving the chain.
--
--  Action items link to an agenda item via `action_items.agenda_item_id`
--  (ON DELETE SET NULL — deleting an agenda item must never destroy the
--  commitment that came out of it). Because internal work rides on a
--  real engagement row, action item assignment, notifications, the
--  due-soon email cron, and My Work all keep working untouched.

-- 1. Internal workspace flag ------------------------------------------

ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Only one internal workspace per org.
CREATE UNIQUE INDEX IF NOT EXISTS "engagements_internal_uniq" ON "engagements" USING btree ("org_id") WHERE "is_internal";--> statement-breakpoint

-- 2. Recurring session series -----------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."session_cadence" AS ENUM('weekly', 'biweekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "session_series" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "title" text NOT NULL,
  "type" "bbs_session_type" NOT NULL,
  "cadence" "session_cadence" NOT NULL,
  -- First occurrence. Fixes the weekday and the time of day for every
  -- instance the materializer generates. Stored UTC; the generator does
  -- its arithmetic in America/Edmonton so a DST boundary doesn't drift
  -- a 9:00 AM touch-base to 8:00 AM.
  "anchor_at" timestamp with time zone NOT NULL,
  "duration_min" integer DEFAULT 60 NOT NULL,
  "notes" text,
  -- Cleared when the series is ended; past instances survive.
  "active" boolean DEFAULT true NOT NULL,
  -- How far ahead instances have been materialized. The rolling-horizon
  -- job tops this up; nothing is generated twice because of the UNIQUE
  -- on (series_id, series_occurrence_at).
  "materialized_until" timestamp with time zone,
  "created_by_user_profile_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_series" ADD CONSTRAINT "session_series_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_series" ADD CONSTRAINT "session_series_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_series" ADD CONSTRAINT "session_series_created_by_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("created_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_series_org_idx" ON "session_series" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_series_engagement_idx" ON "session_series" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_series_active_idx" ON "session_series" USING btree ("active");--> statement-breakpoint
DROP TRIGGER IF EXISTS session_series_set_updated_at ON "session_series";--> statement-breakpoint
CREATE TRIGGER session_series_set_updated_at BEFORE UPDATE ON "session_series" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "session_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_series" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "session_series_tenant_isolation" ON "session_series";--> statement-breakpoint
CREATE POLICY "session_series_tenant_isolation" ON "session_series"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- Session columns for titles + series membership ------------------------

-- Nullable: client BBS sessions have never had a title and read their
-- label from the engagement name. Internal touch-bases need one.
ALTER TABLE "bbs_sessions" ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint
ALTER TABLE "bbs_sessions" ADD COLUMN IF NOT EXISTS "duration_min" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "bbs_sessions" ADD COLUMN IF NOT EXISTS "series_id" uuid;--> statement-breakpoint
-- The scheduled slot this instance was generated for. Kept distinct from
-- `scheduled_at` so moving a single occurrence (a one-off reschedule)
-- doesn't make the materializer regenerate the slot it already filled.
ALTER TABLE "bbs_sessions" ADD COLUMN IF NOT EXISTS "series_occurrence_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bbs_sessions" ADD CONSTRAINT "bbs_sessions_series_id_session_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."session_series"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bbs_sessions_series_occurrence_uniq" ON "bbs_sessions" USING btree ("series_id","series_occurrence_at") WHERE "series_id" IS NOT NULL;--> statement-breakpoint

-- Google Calendar mapping for a SERIES ---------------------------------
--
-- Separate from `google_calendar_event_mappings` (whose bbs_session_id
-- is NOT NULL and load-bearing) because a series maps to ONE recurring
-- Google event carrying an RRULE, not one event per instance. Pushing
-- 13 separate events for a weekly meeting would bury the real rhythm in
-- the coach's calendar.

CREATE TABLE IF NOT EXISTS "session_series_calendar_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "session_series_id" uuid NOT NULL,
  "user_profile_id" uuid NOT NULL,
  "google_event_id" text NOT NULL,
  "google_calendar_id" text NOT NULL,
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_series_calendar_mappings" ADD CONSTRAINT "ssc_mappings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_series_calendar_mappings" ADD CONSTRAINT "ssc_mappings_series_id_session_series_id_fk" FOREIGN KEY ("session_series_id") REFERENCES "public"."session_series"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_series_calendar_mappings" ADD CONSTRAINT "ssc_mappings_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ssc_mappings_org_idx" ON "session_series_calendar_mappings" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ssc_mappings_uniq" ON "session_series_calendar_mappings" USING btree ("session_series_id","user_profile_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS ssc_mappings_set_updated_at ON "session_series_calendar_mappings";--> statement-breakpoint
CREATE TRIGGER ssc_mappings_set_updated_at BEFORE UPDATE ON "session_series_calendar_mappings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "session_series_calendar_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_series_calendar_mappings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ssc_mappings_tenant_isolation" ON "session_series_calendar_mappings";--> statement-breakpoint
CREATE POLICY "ssc_mappings_tenant_isolation" ON "session_series_calendar_mappings"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- 3. Agenda items -------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."agenda_item_status" AS ENUM('pending', 'discussed', 'deferred');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agenda_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "bbs_session_id" uuid NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" "agenda_item_status" DEFAULT 'pending' NOT NULL,
  -- Who put it on the agenda. SET NULL so removing a teammate never
  -- deletes the agenda history.
  "raised_by_user_profile_id" uuid,
  -- Set when this item was carried forward from an earlier meeting's
  -- undiscussed item. Preserves the "we keep punting this" trail.
  "carried_from_agenda_item_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_bbs_session_id_bbs_sessions_id_fk" FOREIGN KEY ("bbs_session_id") REFERENCES "public"."bbs_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_raised_by_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("raised_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_carried_from_agenda_item_id_fk" FOREIGN KEY ("carried_from_agenda_item_id") REFERENCES "public"."agenda_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_items_org_idx" ON "agenda_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_items_session_idx" ON "agenda_items" USING btree ("bbs_session_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_items_status_idx" ON "agenda_items" USING btree ("status");--> statement-breakpoint
DROP TRIGGER IF EXISTS agenda_items_set_updated_at ON "agenda_items";--> statement-breakpoint
CREATE TRIGGER agenda_items_set_updated_at BEFORE UPDATE ON "agenda_items" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "agenda_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agenda_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "agenda_items_tenant_isolation" ON "agenda_items";--> statement-breakpoint
CREATE POLICY "agenda_items_tenant_isolation" ON "agenda_items"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- 4. Action item → agenda item link -------------------------------------

-- SET NULL, not CASCADE: an agenda item is a talking point, the action
-- item is the commitment that came out of it. Deleting the talking point
-- must never delete the commitment.
ALTER TABLE "action_items" ADD COLUMN IF NOT EXISTS "agenda_item_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "action_items" ADD CONSTRAINT "action_items_agenda_item_id_agenda_items_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."agenda_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_items_agenda_item_idx" ON "action_items" USING btree ("agenda_item_id");
