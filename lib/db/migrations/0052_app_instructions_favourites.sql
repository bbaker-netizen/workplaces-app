-- Per-app install/usage instructions, shown to clients in the portal.
ALTER TABLE "embedded_apps" ADD COLUMN IF NOT EXISTS "instructions" text;--> statement-breakpoint

-- Per-user favourites on embedded apps.
CREATE TABLE IF NOT EXISTS "embedded_app_favourites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"embedded_app_id" uuid NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "embedded_app_favourites" ADD CONSTRAINT "embedded_app_favourites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedded_app_favourites" ADD CONSTRAINT "embedded_app_favourites_embedded_app_id_embedded_apps_id_fk" FOREIGN KEY ("embedded_app_id") REFERENCES "public"."embedded_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedded_app_favourites" ADD CONSTRAINT "embedded_app_favourites_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embedded_app_favourites_org_idx" ON "embedded_app_favourites" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "embedded_app_favourites_unique" ON "embedded_app_favourites" USING btree ("embedded_app_id","user_profile_id");--> statement-breakpoint
ALTER TABLE "embedded_app_favourites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "embedded_app_favourites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "embedded_app_favourites_tenant_isolation" ON "embedded_app_favourites"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
