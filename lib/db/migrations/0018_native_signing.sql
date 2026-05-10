-- Phase 4.5 — Native e-signing replaces Adobe Sign.
--
-- Adobe Sign API access is gated behind a paid tier Bruce can't get
-- onto, so we ship a native signing flow instead. Same legal status:
-- typed/drawn signatures with a complete audit trail satisfy the
-- US ESIGN Act + Canadian PIPEDA + Alberta Electronic Transactions Act.
--
-- This migration:
--   1. Drops the Adobe Sign tables, webhook scaffolding stays as
--      a code-level removal (no schema impact).
--   2. Adds `signature_envelopes` (the parent record) +
--      `signature_signers` (one row per signer in the envelope).
--   3. Adds `user_profiles.signature_image_data` so coaches can
--      upload a stored signature image and apply it to envelopes
--      without going through the typed/drawn flow.

-- 1. Adobe Sign cleanup.
DROP TABLE IF EXISTS "adobe_sign_envelopes";--> statement-breakpoint
DROP TABLE IF EXISTS "adobe_sign_oauth_tokens";--> statement-breakpoint

-- 2. signature_envelopes — the parent envelope.
-- prospect_id and engagement_id are both nullable; exactly one
-- should be set in practice but we don't enforce at the DB layer
-- because rules may evolve.
CREATE TABLE "signature_envelopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "prospect_id" uuid,
  "engagement_id" uuid,
  "source_document_id" uuid NOT NULL,
  "signed_document_id" uuid,
  "subject" text NOT NULL,
  "message" text,
  "routing" text NOT NULL DEFAULT 'sequential',
  "status" text NOT NULL DEFAULT 'in_progress',
  "created_by_user_profile_id" uuid,
  "audit_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "completed_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_signed_document_id_documents_id_fk" FOREIGN KEY ("signed_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signature_envelopes_org_idx" ON "signature_envelopes" ("org_id");--> statement-breakpoint
CREATE INDEX "signature_envelopes_engagement_idx" ON "signature_envelopes" ("engagement_id");--> statement-breakpoint
CREATE INDEX "signature_envelopes_prospect_idx" ON "signature_envelopes" ("prospect_id");--> statement-breakpoint
CREATE INDEX "signature_envelopes_status_idx" ON "signature_envelopes" ("status");--> statement-breakpoint
CREATE TRIGGER signature_envelopes_set_updated_at BEFORE UPDATE ON "signature_envelopes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "signature_envelopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signature_envelopes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "signature_envelopes_tenant_isolation" ON "signature_envelopes" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint

-- 3. signature_signers — one row per signer per envelope.
-- public_token is the URL-safe id used in /sign/[token] links.
CREATE TABLE "signature_signers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "envelope_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "order_index" bigint NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "role_label" text,
  "public_token" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "signature_image_data" text,
  "signature_method" text,
  "viewed_at" timestamp with time zone,
  "signed_at" timestamp with time zone,
  "declined_reason" text,
  "signer_ip" text,
  "signer_user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "signature_signers_public_token_unique" UNIQUE ("public_token")
);--> statement-breakpoint
ALTER TABLE "signature_signers" ADD CONSTRAINT "signature_signers_envelope_id_signature_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_signers" ADD CONSTRAINT "signature_signers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signature_signers_envelope_idx" ON "signature_signers" ("envelope_id", "order_index");--> statement-breakpoint
CREATE INDEX "signature_signers_org_idx" ON "signature_signers" ("org_id");--> statement-breakpoint
CREATE INDEX "signature_signers_email_idx" ON "signature_signers" ("email");--> statement-breakpoint
CREATE TRIGGER signature_signers_set_updated_at BEFORE UPDATE ON "signature_signers" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "signature_signers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signature_signers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "signature_signers_tenant_isolation" ON "signature_signers" FOR ALL USING (org_id = auth.org_id()) WITH CHECK (org_id = auth.org_id());--> statement-breakpoint

-- 4. user_profiles.signature_image_data — coach's stored signature.
-- Stored as a base64 data URL (data:image/png;base64,...) so we can
-- render it inline without an extra storage round-trip.
ALTER TABLE "user_profiles" ADD COLUMN "signature_image_data" text;--> statement-breakpoint

-- 5. documents.engagement_id becomes nullable so contract PDFs sent to
-- prospects (where no engagement exists yet) can live in the documents
-- table. Existing engagement documents are unaffected.
ALTER TABLE "documents" ALTER COLUMN "engagement_id" DROP NOT NULL;
