-- Phase 5 — CRM overhaul.
--
-- Brings the Pipeline up to a real CRM: more stages aligned with the
-- Monday workspace pattern, contact-detail columns on prospects, a
-- public web-form intake hook, and a per-prospect activity log
-- (calls, emails, notes, status changes — anything you want to track
-- on the timeline).

-- 1. New stage values added to the prospect_status enum. Existing
--    values stay; we add the new ones alongside. Old "diagnostic_pending"
--    rows can be re-mapped to "new_lead" by the application layer over
--    time; the enum value stays for backwards compat.
ALTER TYPE "public"."prospect_status" ADD VALUE IF NOT EXISTS 'new_lead' BEFORE 'diagnostic_pending';--> statement-breakpoint
ALTER TYPE "public"."prospect_status" ADD VALUE IF NOT EXISTS 'first_contact' AFTER 'new_lead';--> statement-breakpoint
ALTER TYPE "public"."prospect_status" ADD VALUE IF NOT EXISTS 'meeting_scheduled' AFTER 'first_contact';--> statement-breakpoint
ALTER TYPE "public"."prospect_status" ADD VALUE IF NOT EXISTS 'negotiation' AFTER 'proposal_sent';--> statement-breakpoint

-- 2. New CRM columns on prospects.
ALTER TABLE "prospects" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "company_website" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "lead_source" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "expected_value_cents" bigint;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "currency" text DEFAULT 'CAD' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "next_action_date" date;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "next_action_note" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "last_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "owner_user_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_owner_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("owner_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospects_owner_idx" ON "prospects" ("owner_user_profile_id");--> statement-breakpoint
CREATE INDEX "prospects_next_action_idx" ON "prospects" ("next_action_date");--> statement-breakpoint

-- 3. Activity log — every meaningful event on a prospect's timeline.
CREATE TABLE "prospect_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "prospect_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "type" text NOT NULL,
  "subject" text,
  "body" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by_user_profile_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_activities_prospect_idx" ON "prospect_activities" ("prospect_id", "occurred_at" DESC);--> statement-breakpoint
CREATE INDEX "prospect_activities_org_idx" ON "prospect_activities" ("org_id");--> statement-breakpoint
CREATE TRIGGER prospect_activities_set_updated_at BEFORE UPDATE ON "prospect_activities" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "prospect_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_activities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "prospect_activities_tenant_isolation" ON "prospect_activities" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());
