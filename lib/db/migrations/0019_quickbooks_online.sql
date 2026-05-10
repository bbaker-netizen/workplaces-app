-- Phase 4.6 — QuickBooks Online integration.
--
-- Bruce uses QBO + QBO Payments as his primary billing system; Stripe
-- stays available for the rare cases. The invoices table gets a
-- provider column so each invoice carries the source of truth, plus
-- a qbo_invoice_id column matching the existing stripe_invoice_id.
--
-- A new qbo_oauth_tokens table holds per-coach OAuth refresh tokens
-- — same shape as the (now-removed) adobe_sign_oauth_tokens table.

-- 1. Invoice provider tracking.
ALTER TABLE "invoices"
  ADD COLUMN "provider" text NOT NULL DEFAULT 'stripe';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "qbo_invoice_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "qbo_realm_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_qbo_id_idx" ON "invoices" ("qbo_invoice_id") WHERE "qbo_invoice_id" IS NOT NULL;--> statement-breakpoint
-- Existing Stripe invoices keep provider='stripe' (the default).
-- Backfill is implicit since rows that already had a stripe_invoice_id
-- still match the default.

-- 2. QBO OAuth tokens (per coach).
CREATE TABLE "qbo_oauth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coach_user_profile_id" uuid NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "realm_id" text NOT NULL,
  "company_name" text,
  "expires_at" timestamp with time zone NOT NULL,
  "refresh_expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "qbo_oauth_tokens_coach_user_profile_id_unique" UNIQUE ("coach_user_profile_id")
);--> statement-breakpoint
ALTER TABLE "qbo_oauth_tokens" ADD CONSTRAINT "qbo_oauth_tokens_coach_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("coach_user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qbo_oauth_tokens_coach_idx" ON "qbo_oauth_tokens" ("coach_user_profile_id");--> statement-breakpoint
CREATE TRIGGER qbo_oauth_tokens_set_updated_at BEFORE UPDATE ON "qbo_oauth_tokens" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "qbo_oauth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "qbo_oauth_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Tokens have no engagement scope; the table is gated at the app
-- layer (system context only). Permissive policy here.
CREATE POLICY "qbo_oauth_tokens_open" ON "qbo_oauth_tokens" FOR ALL USING (true) WITH CHECK (true);--> statement-breakpoint

-- 3. Engagements get an optional QBO customer reference so we can
-- create QBO invoices without re-looking-up the customer each time.
ALTER TABLE "engagements" ADD COLUMN "qbo_customer_id" text;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "qbo_realm_id" text;
