CREATE TYPE "public"."action_item_created_by" AS ENUM('coach', 'claude');--> statement-breakpoint
CREATE TYPE "public"."action_item_status" AS ENUM('draft', 'open', 'in_progress', 'done', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."confidence_flag" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."notification_sent_via" AS ENUM('email', 'in_app', 'both');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('mention', 'action_item_assigned', 'action_item_due_soon');--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"description" text NOT NULL,
	"status" "action_item_status" DEFAULT 'open' NOT NULL,
	"assignee_user_profile_id" uuid,
	"due_date" timestamp with time zone,
	"revenue_impact" boolean DEFAULT false NOT NULL,
	"margin_impact" boolean DEFAULT false NOT NULL,
	"fireflies_transcript_id" text,
	"confidence_flag" "confidence_flag",
	"created_by" "action_item_created_by" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_tags" (
	"document_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_tags_document_id_tag_pk" PRIMARY KEY("document_id","tag")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"blob_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploader_user_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_blob_key_unique" UNIQUE("blob_key")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"parent_entity_type" text NOT NULL,
	"parent_entity_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_user_profile_id" uuid NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"parent_entity_type" text NOT NULL,
	"parent_entity_id" uuid NOT NULL,
	"sent_via" "notification_sent_via" NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assignee_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("assignee_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploader_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("uploader_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("author_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_org_idx" ON "action_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "action_items_engagement_idx" ON "action_items" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "action_items_assignee_idx" ON "action_items" USING btree ("assignee_user_profile_id");--> statement-breakpoint
CREATE INDEX "action_items_status_idx" ON "action_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_tags_org_idx" ON "document_tags" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "document_tags_tag_idx" ON "document_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "documents_org_idx" ON "documents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "documents_engagement_idx" ON "documents" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "documents_uploader_idx" ON "documents" USING btree ("uploader_user_profile_id");--> statement-breakpoint
CREATE INDEX "messages_org_idx" ON "messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "messages_engagement_idx" ON "messages" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "messages_parent_idx" ON "messages" USING btree ("parent_entity_type","parent_entity_id");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "messages" USING btree ("author_user_profile_id");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "notifications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notifications_user_profile_idx" ON "notifications" USING btree ("user_profile_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_profile_id","read_at");--> statement-breakpoint
-- Phase 1.1: per-table updated_at triggers for the new tenant-scoped tables.
-- Reuses the shared set_updated_at() function defined in migration 0000.
-- See docs/decisions.md "Trigger drift: new tenant-scoped tables need set_updated_at".
CREATE TRIGGER action_items_set_updated_at BEFORE UPDATE ON "action_items" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER messages_set_updated_at BEFORE UPDATE ON "messages" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON "documents" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER document_tags_set_updated_at BEFORE UPDATE ON "document_tags" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON "notifications" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Phase 1.1: RLS — same pattern as 0001_rls_policies.sql for the Phase 0 tables.
-- Every new tenant-scoped table: ENABLE + FORCE row-level security, single
-- FOR ALL policy comparing org_id = auth.org_id().
-- workplaces_app role (created in 0002) needs SELECT/INSERT/UPDATE/DELETE
-- on these tables — the ALTER DEFAULT PRIVILEGES from 0002 grants it
-- automatically for tables created in the public schema by neondb_owner.
ALTER TABLE "action_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "action_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "action_items_tenant_isolation" ON "action_items"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_tenant_isolation" ON "messages"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "documents_tenant_isolation" ON "documents"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "document_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_tags" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_tags_tenant_isolation" ON "document_tags"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());