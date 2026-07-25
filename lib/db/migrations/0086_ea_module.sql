-- Executive Assistant module.
--
-- An EA layer on top of entities that already exist. Five tables and one
-- column; nothing here duplicates an existing concept.
--
--  1. `ea_digests` — one row per digest send. `payload` is the SNAPSHOT
--     the email was rendered from, and it is what every approve link in
--     that email resolves against. Without the snapshot, a link clicked
--     two days later would place a calendar block sized from whatever
--     the action item looks like NOW, which may be nothing like what
--     Bruce agreed to when he read the digest.
--
--  2. `ea_time_blocks` — a proposed (then approved) block of focus time
--     for one action item. UNIQUE on (action_item_id, proposed_start) is
--     the entire idempotency mechanism, exactly as
--     (series_id, series_occurrence_at) is for session_series: a re-run
--     of the digest job, or two overlapping runs, insert nothing rather
--     than proposing the same slot twice.
--
--  3. `ea_email_threads` — the triage ledger. UNIQUE on gmail_thread_id
--     is what stops a re-sweep from drafting a second reply on a thread
--     we already handled. Threads are logged whether or not they
--     classified as a meeting request, so classification never repeats
--     on the same thread (and never bills twice for it).
--
--  4. `session_recaps` — one recap per BBS session, enforced at the
--     database via UNIQUE on bbs_session_id. Recaps are drafts until
--     Bruce approves; `message_id` records the portal thread row written
--     on send so the client-visible record is traceable back here.
--
--  5. `ea_approval_tokens` — every approve link in every EA email
--     resolves through this table. Single use (consumed_at), 72-hour
--     expiry, and the token is HASHED at rest: the row is a verifier,
--     not a copy of the secret, so database read access alone does not
--     let someone approve on Bruce's behalf.
--
--  Plus `action_items.estimated_minutes` — how long a commitment is
--  expected to take, which is what sizes the proposed block. Defaults to
--  60 so every existing row is immediately usable by the proposer.

-- 1. Digests -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ea_digests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_profile_id" uuid NOT NULL,
  -- The MT calendar date this digest covers. Date, not timestamp: two
  -- runs on the same morning are the same digest.
  "sent_for_date" date NOT NULL,
  "payload" jsonb NOT NULL,
  -- Written BEFORE the send is attempted, so a Resend failure loses the
  -- email but never the snapshot the approve links resolve against.
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_digests" ADD CONSTRAINT "ea_digests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_digests" ADD CONSTRAINT "ea_digests_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_digests_org_idx" ON "ea_digests" USING btree ("org_id");--> statement-breakpoint
-- Idempotency: one digest per person per day. The cron's insert uses
-- ON CONFLICT DO NOTHING against this index, so an Inngest retry after a
-- partial failure cannot send a second digest.
CREATE UNIQUE INDEX IF NOT EXISTS "ea_digests_user_date_uniq" ON "ea_digests" USING btree ("user_profile_id", "sent_for_date");--> statement-breakpoint
DROP TRIGGER IF EXISTS ea_digests_set_updated_at ON "ea_digests";--> statement-breakpoint
CREATE TRIGGER ea_digests_set_updated_at BEFORE UPDATE ON "ea_digests" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "ea_digests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ea_digests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ea_digests_tenant_isolation" ON "ea_digests";--> statement-breakpoint
CREATE POLICY "ea_digests_tenant_isolation" ON "ea_digests"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- 2. Time blocks -------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."ea_time_block_status" AS ENUM('proposed', 'approved', 'declined', 'completed', 'rescheduled');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ea_time_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "action_item_id" uuid NOT NULL,
  "user_profile_id" uuid NOT NULL,
  "proposed_start" timestamp with time zone NOT NULL,
  "proposed_end" timestamp with time zone NOT NULL,
  "status" "ea_time_block_status" DEFAULT 'proposed' NOT NULL,
  -- Set once the block is approved and the Google event exists. Needed
  -- to delete the event when the item is completed.
  "google_event_id" text,
  "google_calendar_id" text,
  -- How many times this commitment has been re-proposed after its block
  -- elapsed with the item still open. Drives the escalation ladder in
  -- the digest: a nag that never escalates gets ignored.
  "reschedule_count" integer DEFAULT 0 NOT NULL,
  "digest_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_time_blocks" ADD CONSTRAINT "ea_time_blocks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_time_blocks" ADD CONSTRAINT "ea_time_blocks_action_item_id_action_items_id_fk" FOREIGN KEY ("action_item_id") REFERENCES "public"."action_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_time_blocks" ADD CONSTRAINT "ea_time_blocks_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_time_blocks" ADD CONSTRAINT "ea_time_blocks_digest_id_ea_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."ea_digests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_time_blocks_org_idx" ON "ea_time_blocks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_time_blocks_action_item_idx" ON "ea_time_blocks" USING btree ("action_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_time_blocks_user_idx" ON "ea_time_blocks" USING btree ("user_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_time_blocks_status_idx" ON "ea_time_blocks" USING btree ("status");--> statement-breakpoint
-- THE idempotency key. Same role as (series_id, series_occurrence_at) on
-- bbs_sessions: the proposer's onConflictDoNothing() relies on it.
CREATE UNIQUE INDEX IF NOT EXISTS "ea_time_blocks_item_start_uniq" ON "ea_time_blocks" USING btree ("action_item_id", "proposed_start");--> statement-breakpoint
DROP TRIGGER IF EXISTS ea_time_blocks_set_updated_at ON "ea_time_blocks";--> statement-breakpoint
CREATE TRIGGER ea_time_blocks_set_updated_at BEFORE UPDATE ON "ea_time_blocks" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "ea_time_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ea_time_blocks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ea_time_blocks_tenant_isolation" ON "ea_time_blocks";--> statement-breakpoint
CREATE POLICY "ea_time_blocks_tenant_isolation" ON "ea_time_blocks"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- 3. Inbound email triage ledger ---------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."ea_email_classification" AS ENUM('meeting_request', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ea_email_thread_status" AS ENUM('drafted', 'skipped', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ea_email_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_profile_id" uuid NOT NULL,
  "gmail_thread_id" text NOT NULL,
  "classification" "ea_email_classification" NOT NULL,
  "prospect_id" uuid,
  -- Gmail's draft id, so the draft can be found (or replaced) later.
  "draft_id" text,
  "status" "ea_email_thread_status" NOT NULL,
  -- Why we skipped, or why the draft failed. Operator breadcrumb.
  "note" text,
  "handled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_email_threads" ADD CONSTRAINT "ea_email_threads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_email_threads" ADD CONSTRAINT "ea_email_threads_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_email_threads" ADD CONSTRAINT "ea_email_threads_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_email_threads_org_idx" ON "ea_email_threads" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_email_threads_user_idx" ON "ea_email_threads" USING btree ("user_profile_id");--> statement-breakpoint
-- Stops a re-sweep drafting twice on one thread.
CREATE UNIQUE INDEX IF NOT EXISTS "ea_email_threads_gmail_thread_uniq" ON "ea_email_threads" USING btree ("gmail_thread_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS ea_email_threads_set_updated_at ON "ea_email_threads";--> statement-breakpoint
CREATE TRIGGER ea_email_threads_set_updated_at BEFORE UPDATE ON "ea_email_threads" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "ea_email_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ea_email_threads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ea_email_threads_tenant_isolation" ON "ea_email_threads";--> statement-breakpoint
CREATE POLICY "ea_email_threads_tenant_isolation" ON "ea_email_threads"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- 4. Session recaps ----------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."session_recap_status" AS ENUM('draft', 'approved', 'sent');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "session_recaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "engagement_id" uuid NOT NULL,
  "bbs_session_id" uuid NOT NULL,
  "status" "session_recap_status" DEFAULT 'draft' NOT NULL,
  "subject" text NOT NULL,
  "body_html" text NOT NULL,
  "body_text" text NOT NULL,
  "fireflies_url" text,
  -- The session this recap points forward to, and whose carried-forward
  -- agenda it publishes.
  "next_session_id" uuid,
  "approved_by_user_profile_id" uuid,
  "approved_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  -- The portal thread row written on send. The permanent client record.
  "message_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_recaps" ADD CONSTRAINT "session_recaps_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_recaps" ADD CONSTRAINT "session_recaps_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_recaps" ADD CONSTRAINT "session_recaps_bbs_session_id_bbs_sessions_id_fk" FOREIGN KEY ("bbs_session_id") REFERENCES "public"."bbs_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_recaps" ADD CONSTRAINT "session_recaps_next_session_id_bbs_sessions_id_fk" FOREIGN KEY ("next_session_id") REFERENCES "public"."bbs_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_recaps" ADD CONSTRAINT "session_recaps_approved_by_user_profiles_id_fk" FOREIGN KEY ("approved_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_recaps" ADD CONSTRAINT "session_recaps_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_recaps_org_idx" ON "session_recaps" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_recaps_engagement_idx" ON "session_recaps" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_recaps_status_idx" ON "session_recaps" USING btree ("status");--> statement-breakpoint
-- One recap per session, enforced at the database.
CREATE UNIQUE INDEX IF NOT EXISTS "session_recaps_session_uniq" ON "session_recaps" USING btree ("bbs_session_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS session_recaps_set_updated_at ON "session_recaps";--> statement-breakpoint
CREATE TRIGGER session_recaps_set_updated_at BEFORE UPDATE ON "session_recaps" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "session_recaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_recaps" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "session_recaps_tenant_isolation" ON "session_recaps";--> statement-breakpoint
CREATE POLICY "session_recaps_tenant_isolation" ON "session_recaps"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- 5. Approval tokens ---------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."ea_approval_subject" AS ENUM('time_block', 'session_recap');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ea_approval_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  -- SHA-256 of the 32-byte random token. The plaintext exists only in
  -- the emailed URL; the row is a verifier, never a copy of the secret.
  "token_hash" text NOT NULL,
  "subject_type" "ea_approval_subject" NOT NULL,
  "subject_id" uuid NOT NULL,
  -- Who the link was issued to. Recorded on the row so a consumed token
  -- attributes the approval to a real person.
  "user_profile_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_approval_tokens" ADD CONSTRAINT "ea_approval_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_approval_tokens" ADD CONSTRAINT "ea_approval_tokens_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ea_approval_tokens_hash_uniq" ON "ea_approval_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_approval_tokens_org_idx" ON "ea_approval_tokens" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_approval_tokens_subject_idx" ON "ea_approval_tokens" USING btree ("subject_type", "subject_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS ea_approval_tokens_set_updated_at ON "ea_approval_tokens";--> statement-breakpoint
CREATE TRIGGER ea_approval_tokens_set_updated_at BEFORE UPDATE ON "ea_approval_tokens" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "ea_approval_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ea_approval_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ea_approval_tokens_tenant_isolation" ON "ea_approval_tokens";--> statement-breakpoint
CREATE POLICY "ea_approval_tokens_tenant_isolation" ON "ea_approval_tokens"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
--> statement-breakpoint

-- 6. Action item duration estimate -------------------------------------

-- Sizes the proposed focus block. 60 is the default so every existing
-- row is usable by the proposer on day one without a backfill.
ALTER TABLE "action_items" ADD COLUMN IF NOT EXISTS "estimated_minutes" integer DEFAULT 60 NOT NULL;
