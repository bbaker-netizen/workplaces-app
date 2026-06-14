-- New portal module key so "My Notes" can be toggled per engagement.
ALTER TYPE "public"."portal_module" ADD VALUE IF NOT EXISTS 'notes';--> statement-breakpoint
-- Private per-user scratchpad in the client portal. One markdown note per
-- (engagement, user); visible only to its owner. Same tenant-scoped RLS
-- pattern as every other table.
CREATE TABLE IF NOT EXISTS "portal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_notes" ADD CONSTRAINT "portal_notes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_notes" ADD CONSTRAINT "portal_notes_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_notes" ADD CONSTRAINT "portal_notes_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_notes_org_idx" ON "portal_notes" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_notes_engagement_user_unique" ON "portal_notes" USING btree ("engagement_id","user_profile_id");--> statement-breakpoint
CREATE TRIGGER portal_notes_set_updated_at BEFORE UPDATE ON "portal_notes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "portal_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portal_notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "portal_notes_tenant_isolation" ON "portal_notes"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
