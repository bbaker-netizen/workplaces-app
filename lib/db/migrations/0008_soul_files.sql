CREATE TABLE "soul_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"last_editor_user_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "soul_files_engagement_id_unique" UNIQUE("engagement_id")
);
--> statement-breakpoint
ALTER TABLE "soul_files" ADD CONSTRAINT "soul_files_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soul_files" ADD CONSTRAINT "soul_files_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soul_files" ADD CONSTRAINT "soul_files_last_editor_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("last_editor_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "soul_files_org_idx" ON "soul_files" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "soul_files_engagement_idx" ON "soul_files" USING btree ("engagement_id");--> statement-breakpoint
-- Phase 1.7: per-table updated_at trigger.
CREATE TRIGGER soul_files_set_updated_at BEFORE UPDATE ON "soul_files" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Phase 1.7: RLS — same pattern as every other tenant-scoped table.
ALTER TABLE "soul_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "soul_files" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "soul_files_tenant_isolation" ON "soul_files"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());