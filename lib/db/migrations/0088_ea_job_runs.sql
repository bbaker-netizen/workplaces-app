-- Heartbeat for the Executive Assistant's background jobs.
--
-- The failure this exists to catch is the silent one. Every EA job is a
-- cron that nobody watches: it can stop firing, lose its Google token,
-- or start throwing on every run, and the only symptom is an email that
-- quietly does not arrive. A missing email is indistinguishable from a
-- quiet week, which is exactly why it can go unnoticed for a month.
--
-- One row per job run, written on completion INCLUDING failures, so
-- "when did this last actually work, and what did it do" is a query
-- rather than a guess.
--
-- Deliberately NOT tenant-scoped. There is no `org_id` and no
-- permissive policy: this is operational telemetry about the practice's
-- own machinery, not client data, and a run may have no user at all
-- (hence `user_profile_id` nullable). RLS is enabled and FORCEd with no
-- policy granted, which means the runtime role `workplaces_app` can read
-- nothing here at all — the table is reachable only through
-- `withSystemContext`, which runs as the BYPASSRLS owner. That is a
-- stronger guarantee than a tenant policy would give: no tenant-bound
-- query can reach operational data even by accident.

DO $$ BEGIN
  CREATE TYPE "public"."ea_job_run_status" AS ENUM('success', 'partial', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ea_job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Stable identifier, matching the Inngest function id where there is
  -- one (e.g. 'ea-daily-digest'). Plain text rather than an enum so a
  -- new job does not need a migration to start reporting.
  "job_id" text NOT NULL,
  -- Null for practice-wide runs. Populated only where a run is genuinely
  -- scoped to one Business Builder.
  "user_profile_id" uuid,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" "ea_job_run_status" NOT NULL,
  -- What the run actually did: digests sent, drafts written, blocks
  -- proposed. Zero is a valid, healthy answer on a quiet day, which is
  -- why it is reported alongside the status rather than inferred from it.
  "items_processed" integer DEFAULT 0 NOT NULL,
  "error_text" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ea_job_runs" ADD CONSTRAINT "ea_job_runs_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- The heartbeat read is "latest run per job" and "latest SUCCESSFUL run
-- per job". Both walk backwards through one job's history, so job_id
-- leads and completed_at descends.
CREATE INDEX IF NOT EXISTS "ea_job_runs_job_completed_idx" ON "ea_job_runs" USING btree ("job_id", "completed_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ea_job_runs_status_idx" ON "ea_job_runs" USING btree ("status");--> statement-breakpoint

ALTER TABLE "ea_job_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ea_job_runs" FORCE ROW LEVEL SECURITY;
-- No policy is created on purpose. See the header: with RLS enabled and
-- no permissive policy, `workplaces_app` matches no rows for any command,
-- and only the BYPASSRLS owner used by withSystemContext can touch it.
