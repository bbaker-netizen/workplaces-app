CREATE TYPE "public"."cohort_status" AS ENUM('upcoming', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."course_delivery_mode" AS ENUM('self_paced', 'cohort');--> statement-breakpoint
CREATE TYPE "public"."deliverable_status" AS ENUM('not_started', 'in_progress', 'review', 'delivered', 'archived');--> statement-breakpoint
CREATE TYPE "public"."deliverable_type" AS ENUM('sop', 'org_chart', 'job_profile', 'financial_dashboard', 'onboarding_guide', 'operations_setup_guide', 'business_plan', 'marketing_plan', 'stages_of_growth_assessment');--> statement-breakpoint
CREATE TYPE "public"."embedded_app_auth_mode" AS ENUM('public', 'token_passthrough', 'clerk_sso');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('enrolled', 'in_progress', 'completed', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."form_type" AS ENUM('diagnostic', 'intake', 'pulse', 'nps', 'custom');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."subscription_asset_model" AS ENUM('model_a', 'model_b', 'model_c');--> statement-breakpoint
CREATE TYPE "public"."subscription_transfer_status" AS ENUM('retained', 'pending_transfer', 'transferred');--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "cohort_status" DEFAULT 'upcoming' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"delivery_mode" "course_delivery_mode" NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"type" "deliverable_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "deliverable_status" DEFAULT 'not_started' NOT NULL,
	"document_id" uuid,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedded_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"netlify_project_id" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"app_url" text NOT NULL,
	"auth_mode" "embedded_app_auth_mode" DEFAULT 'public' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"cohort_id" uuid,
	"user_profile_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'enrolled' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"submitted_by_user_profile_id" uuid,
	"respondent_name" text,
	"respondent_email" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "form_type" NOT NULL,
	"schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"public_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forms_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"stripe_invoice_id" text,
	"number" text,
	"description" text,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"hosted_invoice_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"order_index" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor" text NOT NULL,
	"monthly_cost_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"paid_by" text DEFAULT 'workplaces' NOT NULL,
	"model" "subscription_asset_model" DEFAULT 'model_c' NOT NULL,
	"transfer_status" "subscription_transfer_status" DEFAULT 'retained' NOT NULL,
	"notes" text,
	"renewal_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedded_apps" ADD CONSTRAINT "embedded_apps_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedded_apps" ADD CONSTRAINT "embedded_apps_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_submitted_by_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("submitted_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_assets" ADD CONSTRAINT "subscription_assets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_assets" ADD CONSTRAINT "subscription_assets_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cohorts_org_idx" ON "cohorts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "cohorts_course_idx" ON "cohorts" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "courses_org_idx" ON "courses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "courses_engagement_idx" ON "courses" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "deliverables_org_idx" ON "deliverables" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "deliverables_engagement_idx" ON "deliverables" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "deliverables_type_idx" ON "deliverables" USING btree ("type");--> statement-breakpoint
CREATE INDEX "deliverables_status_idx" ON "deliverables" USING btree ("status");--> statement-breakpoint
CREATE INDEX "embedded_apps_org_idx" ON "embedded_apps" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "embedded_apps_engagement_idx" ON "embedded_apps" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "enrollments_org_idx" ON "enrollments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "enrollments_course_idx" ON "enrollments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "enrollments_cohort_idx" ON "enrollments" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "enrollments_user_idx" ON "enrollments" USING btree ("user_profile_id");--> statement-breakpoint
CREATE INDEX "form_submissions_org_idx" ON "form_submissions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "forms_org_idx" ON "forms" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "forms_engagement_idx" ON "forms" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "forms_type_idx" ON "forms" USING btree ("type");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invoices_engagement_idx" ON "invoices" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lessons_org_idx" ON "lessons" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lessons_course_idx" ON "lessons" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "subscription_assets_org_idx" ON "subscription_assets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscription_assets_engagement_idx" ON "subscription_assets" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "subscription_assets_transfer_idx" ON "subscription_assets" USING btree ("transfer_status");--> statement-breakpoint
-- Triggers + RLS for every new tenant-scoped table.
CREATE TRIGGER forms_set_updated_at BEFORE UPDATE ON "forms" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER form_submissions_set_updated_at BEFORE UPDATE ON "form_submissions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER deliverables_set_updated_at BEFORE UPDATE ON "deliverables" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON "invoices" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER subscription_assets_set_updated_at BEFORE UPDATE ON "subscription_assets" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER embedded_apps_set_updated_at BEFORE UPDATE ON "embedded_apps" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON "courses" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER lessons_set_updated_at BEFORE UPDATE ON "lessons" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER cohorts_set_updated_at BEFORE UPDATE ON "cohorts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER enrollments_set_updated_at BEFORE UPDATE ON "enrollments" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "forms_tenant_isolation" ON "forms" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "form_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_submissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "form_submissions_tenant_isolation" ON "form_submissions" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "deliverables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deliverables" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "deliverables_tenant_isolation" ON "deliverables" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_tenant_isolation" ON "invoices" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "subscription_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "subscription_assets_tenant_isolation" ON "subscription_assets" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "embedded_apps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "embedded_apps" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "embedded_apps_tenant_isolation" ON "embedded_apps" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "courses_tenant_isolation" ON "courses" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lessons" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "lessons_tenant_isolation" ON "lessons" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "cohorts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cohorts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "cohorts_tenant_isolation" ON "cohorts" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrollments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "enrollments_tenant_isolation" ON "enrollments" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());
