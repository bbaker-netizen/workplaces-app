CREATE TYPE "public"."hire_status" AS ENUM('assessing', 'interview_scheduled', 'decision_pending', 'offer_sent', 'hired', 'declined');--> statement-breakpoint
CREATE TABLE "hires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"candidate_name" text NOT NULL,
	"candidate_email" text,
	"role_name" text NOT NULL,
	"status" "hire_status" DEFAULT 'assessing' NOT NULL,
	"gap_report_document_id" uuid,
	"resume_document_id" uuid,
	"offer_document_id" uuid,
	"notes" text,
	"interview_scheduled_at" timestamp with time zone,
	"decision_at" timestamp with time zone,
	"offer_sent_at" timestamp with time zone,
	"hired_at" timestamp with time zone,
	"created_by_user_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_gap_report_document_id_documents_id_fk" FOREIGN KEY ("gap_report_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_resume_document_id_documents_id_fk" FOREIGN KEY ("resume_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_offer_document_id_documents_id_fk" FOREIGN KEY ("offer_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hires" ADD CONSTRAINT "hires_created_by_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("created_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hires_org_idx" ON "hires" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "hires_engagement_idx" ON "hires" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "hires_status_idx" ON "hires" USING btree ("status");--> statement-breakpoint
CREATE TRIGGER hires_set_updated_at BEFORE UPDATE ON "hires" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "hires" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hires" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hires_tenant_isolation" ON "hires" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());