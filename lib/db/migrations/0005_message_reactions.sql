CREATE TABLE "message_reactions" (
	"message_id" uuid NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_message_id_user_profile_id_emoji_pk" PRIMARY KEY("message_id","user_profile_id","emoji")
);
--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_reactions_org_idx" ON "message_reactions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "message_reactions_message_idx" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_reactions_user_idx" ON "message_reactions" USING btree ("user_profile_id");--> statement-breakpoint
-- Phase 1.3.5: per-table updated_at trigger for message_reactions.
-- Reuses the shared set_updated_at() function defined in migration 0000.
-- See docs/decisions.md "Trigger drift: new tenant-scoped tables need set_updated_at".
CREATE TRIGGER message_reactions_set_updated_at BEFORE UPDATE ON "message_reactions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Phase 1.3.5: RLS — same pattern as 0001/0003 for tenant-scoped tables.
-- workplaces_app role (created in 0002) gets SELECT/INSERT/UPDATE/DELETE
-- automatically via the ALTER DEFAULT PRIVILEGES from 0002.
ALTER TABLE "message_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_reactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "message_reactions_tenant_isolation" ON "message_reactions"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());