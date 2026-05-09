CREATE TABLE "message_attachments" (
	"message_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_attachments_message_id_document_id_pk" PRIMARY KEY("message_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_attachments_org_idx" ON "message_attachments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_attachments_document_idx" ON "message_attachments" USING btree ("document_id");--> statement-breakpoint
-- Phase 1.5: per-table updated_at trigger for message_attachments.
-- Reuses the shared set_updated_at() function defined in migration 0000.
CREATE TRIGGER message_attachments_set_updated_at BEFORE UPDATE ON "message_attachments" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Phase 1.5: RLS — same pattern as 0001/0003/0005 for tenant-scoped tables.
-- workplaces_app role (created in 0002) gets SELECT/INSERT/UPDATE/DELETE
-- automatically via the ALTER DEFAULT PRIVILEGES from 0002.
ALTER TABLE "message_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_attachments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "message_attachments_tenant_isolation" ON "message_attachments"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());