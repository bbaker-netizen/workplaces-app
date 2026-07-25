-- Proposed agendas for upcoming sessions.
--
-- The morning briefing already says what is open going into a session.
-- It does not help decide what the session should be ABOUT, which is
-- still done from memory or by re-reading the Soul File on the drive
-- over. This holds a drafted agenda — built from the last session's
-- transcript, what is overdue, and what is in flight — until the coach
-- accepts it.
--
-- Why a table rather than writing straight into `agenda_items`: agenda
-- items are CLIENT-VISIBLE in the portal. Writing drafted talking points
-- directly would put machine-generated text in front of a client before
-- their coach had read it, which is the same line the recap flow refuses
-- to cross. Nothing reaches `agenda_items` until an approve link is
-- tapped.
--
-- UNIQUE on `bbs_session_id`: one proposal per session, ever. A re-run
-- of the digest proposes nothing new, and a declined agenda stays
-- declined rather than being re-offered every morning until the session
-- happens.

DO $$ BEGIN
  CREATE TYPE "public"."ea_agenda_proposal_status" AS ENUM('proposed', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ea_agenda_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "bbs_session_id" uuid NOT NULL,
  -- Array of {title, body} objects, stored as drafted, so accepting is a
  -- pure copy into agenda_items with no second model call and no chance
  -- of the accepted text differing from the text that was reviewed.
  "items" jsonb NOT NULL,
  "status" "ea_agenda_proposal_status" DEFAULT 'proposed' NOT NULL,
  "digest_id" uuid,
  "accepted_by_user_profile_id" uuid,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_agenda_proposals" ADD CONSTRAINT "ea_agenda_proposals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_agenda_proposals" ADD CONSTRAINT "ea_agenda_proposals_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_agenda_proposals" ADD CONSTRAINT "ea_agenda_proposals_bbs_session_id_bbs_sessions_id_fk" FOREIGN KEY ("bbs_session_id") REFERENCES "public"."bbs_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_agenda_proposals" ADD CONSTRAINT "ea_agenda_proposals_accepted_by_user_profiles_id_fk" FOREIGN KEY ("accepted_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_agenda_proposals_org_idx" ON "ea_agenda_proposals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_agenda_proposals_status_idx" ON "ea_agenda_proposals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ea_agenda_proposals_session_uniq" ON "ea_agenda_proposals" USING btree ("bbs_session_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS ea_agenda_proposals_set_updated_at ON "ea_agenda_proposals";--> statement-breakpoint
CREATE TRIGGER ea_agenda_proposals_set_updated_at BEFORE UPDATE ON "ea_agenda_proposals" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "ea_agenda_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ea_agenda_proposals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ea_agenda_proposals_tenant_isolation" ON "ea_agenda_proposals";--> statement-breakpoint
CREATE POLICY "ea_agenda_proposals_tenant_isolation" ON "ea_agenda_proposals"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
