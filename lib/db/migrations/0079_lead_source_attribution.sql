-- Lead-source attribution — Phase 5.
--
-- Adds the canonical acquisition channel to every prospect, enforced
-- NOT NULL at the DB level so no lead can ever land untagged (the whole
-- point: this is the dataset that settles which channels actually pay).
-- Plus the three attribution timestamps (first touch, booked session,
-- became client) and a hand-entered channel_spend table for the
-- cost-per report.
--
-- First-touch: `source` reflects how a prospect FIRST reached us and is
-- never overwritten. The free-text `lead_source` label is retained
-- untouched — this migration only ADDS.
--
-- Backfill policy (deliberate): existing rows get their channel by a
-- strict 1:1 relabel of the verbatim tags the system itself wrote
-- (Facebook Ads → meta, Google Ads Campaign → google_ads, Referral →
-- referral, LinkedIn → linkedin, Google Search → organic_search).
-- EVERYTHING else — Website Form, Diagnostic, Repeat Client, blanks —
-- goes to `other`. We relabel what we know for certain and refuse to
-- guess the rest, so the report starts clean.

-- 1. The channel enum. --------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."lead_source_channel" AS ENUM(
    'google_ads', 'meta', 'organic_search', 'direct',
    'referral', 'podcast', 'linkedin', 'cold_inbound', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

-- 2. New prospect columns (nullable first, backfill, then NOT NULL). ----
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "source" "lead_source_channel";--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "source_detail" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "first_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "booked_session_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "became_client_at" timestamp with time zone;--> statement-breakpoint

-- 3. Backfill source — strict 1:1 relabel; unknown → other. ------------
UPDATE "prospects" SET "source" = (
  CASE lower(trim(coalesce("lead_source", '')))
    WHEN 'facebook ads'          THEN 'meta'
    WHEN 'google ads campaign'   THEN 'google_ads'
    WHEN 'google search'         THEN 'organic_search'
    WHEN 'referral'              THEN 'referral'
    WHEN 'linkedin'              THEN 'linkedin'
    ELSE 'other'
  END
)::"lead_source_channel"
WHERE "source" IS NULL;--> statement-breakpoint

-- first_seen_at = when the row was created (first touch we have).
UPDATE "prospects" SET "first_seen_at" = "created_at" WHERE "first_seen_at" IS NULL;--> statement-breakpoint

-- booked_session_at = earliest live booking tied to this prospect.
UPDATE "prospects" p SET "booked_session_at" = b.first_booked
FROM (
  SELECT prospect_id, min(booked_at) AS first_booked
  FROM "bookings"
  WHERE prospect_id IS NOT NULL AND cancelled_at IS NULL
  GROUP BY prospect_id
) b
WHERE b.prospect_id = p.id AND p."booked_session_at" IS NULL;--> statement-breakpoint

-- became_client_at = when an existing client onboarded. Use the signed
-- date where we have it, else the last status change (updated_at) as the
-- best available anchor. Only dates a KNOWN client — never invents one.
UPDATE "prospects"
SET "became_client_at" = coalesce("contract_signed_at", "updated_at")
WHERE "status" = 'onboarded' AND "became_client_at" IS NULL;--> statement-breakpoint

-- 4. Lock it in — every prospect now has a channel, forever. -----------
-- NOT NULL, NO default: an insert that omits source is a hard error, not
-- a silent 'other'. That is the DB-level enforcement the spec requires —
-- every write path (manual form, webhooks, bookings) sets source explicitly.
ALTER TABLE "prospects" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prospects_source_idx" ON "prospects" USING btree ("source");--> statement-breakpoint

-- 5. Channel spend — one hand-entered figure per channel per month. -----
CREATE TABLE IF NOT EXISTS "channel_spend" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "channel" "lead_source_channel" NOT NULL,
  -- First day of the month the spend applies to (a DATE, always day 01).
  "month" date NOT NULL,
  "amount_cents" bigint NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "channel_spend" ADD CONSTRAINT "channel_spend_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_spend_org_channel_month_uniq" ON "channel_spend" USING btree ("org_id", "channel", "month");--> statement-breakpoint
DROP TRIGGER IF EXISTS channel_spend_set_updated_at ON "channel_spend";--> statement-breakpoint
CREATE TRIGGER channel_spend_set_updated_at BEFORE UPDATE ON "channel_spend" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "channel_spend" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channel_spend" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "channel_spend_tenant_isolation" ON "channel_spend";--> statement-breakpoint
CREATE POLICY "channel_spend_tenant_isolation" ON "channel_spend"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
