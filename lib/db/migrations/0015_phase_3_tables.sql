CREATE TYPE "public"."person_profile_source" AS ENUM('tti_trimetrix_hd', 'manual');--> statement-breakpoint
CREATE TYPE "public"."portal_module" AS ENUM('action_items', 'goals', 'projects', 'sessions', 'soul_file', 'deliverables', 'communication', 'documents', 'courses', 'forms', 'team', 'invoices', 'methodology', 'embedded_apps', 'subscriptions', 'hiring');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('diagnostic_pending', 'diagnostic_complete', 'proposal_sent', 'contract_sent', 'contract_signed', 'onboarded', 'lost');--> statement-breakpoint
CREATE TYPE "public"."scheduling_meeting_type" AS ENUM('discovery', 'bbs', 'ad_hoc');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scheduling_link_id" uuid NOT NULL,
	"booked_at" timestamp with time zone NOT NULL,
	"duration_minutes" bigint NOT NULL,
	"booker_name" text NOT NULL,
	"booker_email" text NOT NULL,
	"booker_company" text,
	"notes" text,
	"bbs_session_id" uuid,
	"prospect_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"user_profile_id" uuid,
	"full_name" text NOT NULL,
	"role" text,
	"source" "person_profile_source" DEFAULT 'tti_trimetrix_hd' NOT NULL,
	"assessment_date" timestamp with time zone,
	"summary" text,
	"raw_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_module_assignments" (
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"module" "portal_module" NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_module_assignments_engagement_id_module_pk" PRIMARY KEY("engagement_id","module")
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text NOT NULL,
	"industry" text,
	"status" "prospect_status" DEFAULT 'diagnostic_pending' NOT NULL,
	"diagnostic_submission_id" uuid,
	"converted_engagement_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"coach_user_profile_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"meeting_type" "scheduling_meeting_type" DEFAULT 'discovery' NOT NULL,
	"duration_minutes" bigint DEFAULT 30 NOT NULL,
	"availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_scheduling_link_id_scheduling_links_id_fk" FOREIGN KEY ("scheduling_link_id") REFERENCES "public"."scheduling_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_bbs_session_id_bbs_sessions_id_fk" FOREIGN KEY ("bbs_session_id") REFERENCES "public"."bbs_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_profiles" ADD CONSTRAINT "person_profiles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_profiles" ADD CONSTRAINT "person_profiles_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_profiles" ADD CONSTRAINT "person_profiles_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_profiles" ADD CONSTRAINT "person_profiles_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_module_assignments" ADD CONSTRAINT "portal_module_assignments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_module_assignments" ADD CONSTRAINT "portal_module_assignments_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_diagnostic_submission_id_form_submissions_id_fk" FOREIGN KEY ("diagnostic_submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_converted_engagement_id_engagements_id_fk" FOREIGN KEY ("converted_engagement_id") REFERENCES "public"."engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_links" ADD CONSTRAINT "scheduling_links_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_links" ADD CONSTRAINT "scheduling_links_coach_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("coach_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_org_idx" ON "bookings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bookings_link_idx" ON "bookings" USING btree ("scheduling_link_id");--> statement-breakpoint
CREATE INDEX "bookings_booked_at_idx" ON "bookings" USING btree ("booked_at");--> statement-breakpoint
CREATE INDEX "person_profiles_org_idx" ON "person_profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "person_profiles_engagement_idx" ON "person_profiles" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "person_profiles_user_idx" ON "person_profiles" USING btree ("user_profile_id");--> statement-breakpoint
CREATE INDEX "portal_module_assignments_org_idx" ON "portal_module_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "portal_module_assignments_engagement_idx" ON "portal_module_assignments" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "prospects_org_idx" ON "prospects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "prospects_status_idx" ON "prospects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prospects_email_idx" ON "prospects" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX "scheduling_links_org_idx" ON "scheduling_links" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "scheduling_links_coach_idx" ON "scheduling_links" USING btree ("coach_user_profile_id");--> statement-breakpoint
CREATE TRIGGER portal_module_assignments_set_updated_at BEFORE UPDATE ON "portal_module_assignments" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER prospects_set_updated_at BEFORE UPDATE ON "prospects" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER person_profiles_set_updated_at BEFORE UPDATE ON "person_profiles" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER scheduling_links_set_updated_at BEFORE UPDATE ON "scheduling_links" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON "bookings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "portal_module_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portal_module_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "portal_module_assignments_tenant_isolation" ON "portal_module_assignments" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "prospects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "prospects_tenant_isolation" ON "prospects" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "person_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "person_profiles_tenant_isolation" ON "person_profiles" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "scheduling_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scheduling_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "scheduling_links_tenant_isolation" ON "scheduling_links" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "bookings_tenant_isolation" ON "bookings" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());
