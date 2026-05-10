CREATE TABLE "adobe_sign_oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_user_profile_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"api_base" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adobe_sign_oauth_tokens_coach_user_profile_id_unique" UNIQUE("coach_user_profile_id")
);
--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"notification_id" uuid NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_notification_id_user_profile_id_pk" PRIMARY KEY("notification_id","user_profile_id")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "parent_document_id" uuid;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "stage_of_growth_stage" bigint;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "stage_assessed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "parent_message_id" uuid;--> statement-breakpoint
ALTER TABLE "adobe_sign_oauth_tokens" ADD CONSTRAINT "adobe_sign_oauth_tokens_coach_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("coach_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adobe_sign_oauth_tokens_coach_idx" ON "adobe_sign_oauth_tokens" USING btree ("coach_user_profile_id");--> statement-breakpoint
CREATE INDEX "notification_reads_org_idx" ON "notification_reads" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_document_id_documents_id_fk" FOREIGN KEY ("parent_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_message_id_messages_id_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER adobe_sign_oauth_tokens_set_updated_at BEFORE UPDATE ON "adobe_sign_oauth_tokens" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER notification_reads_set_updated_at BEFORE UPDATE ON "notification_reads" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "adobe_sign_oauth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adobe_sign_oauth_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Adobe tokens have no engagement scope; only the coach themselves should read.
-- Use a permissive policy here and gate writes/reads via withSystemContext at the app layer.
CREATE POLICY "adobe_sign_oauth_tokens_open" ON "adobe_sign_oauth_tokens" FOR ALL USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER TABLE "notification_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_reads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_reads_tenant_isolation" ON "notification_reads" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());
