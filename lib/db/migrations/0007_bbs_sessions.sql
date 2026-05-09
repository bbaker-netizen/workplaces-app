CREATE TYPE "public"."bbs_session_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."bbs_session_type" AS ENUM('in_person', 'virtual');--> statement-breakpoint
CREATE TABLE "bbs_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"type" "bbs_session_type" NOT NULL,
	"status" "bbs_session_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"fireflies_recording_id" text,
	"created_by_user_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_items" ADD COLUMN "bbs_session_id" uuid;--> statement-breakpoint
ALTER TABLE "bbs_sessions" ADD CONSTRAINT "bbs_sessions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bbs_sessions" ADD CONSTRAINT "bbs_sessions_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bbs_sessions" ADD CONSTRAINT "bbs_sessions_created_by_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("created_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bbs_sessions_org_idx" ON "bbs_sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bbs_sessions_engagement_idx" ON "bbs_sessions" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "bbs_sessions_scheduled_at_idx" ON "bbs_sessions" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "bbs_sessions_status_idx" ON "bbs_sessions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_bbs_session_id_bbs_sessions_id_fk" FOREIGN KEY ("bbs_session_id") REFERENCES "public"."bbs_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_bbs_session_idx" ON "action_items" USING btree ("bbs_session_id");--> statement-breakpoint
-- Phase 1.6: per-table updated_at trigger for bbs_sessions.
-- Reuses the shared set_updated_at() function from migration 0000.
CREATE TRIGGER bbs_sessions_set_updated_at BEFORE UPDATE ON "bbs_sessions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Phase 1.6: RLS — same pattern as 0001/0003/0005/0006 for tenant-scoped tables.
ALTER TABLE "bbs_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bbs_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "bbs_sessions_tenant_isolation" ON "bbs_sessions"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());