-- Paid-click attribution + Google Ads offline-conversion watermarks.
-- ERP build spec 2026-07-13, items 5 & 6.
--
-- The website snippet (WPCode 4556) now captures gclid/gbraid/wbraid/fbclid and
-- the utm params into 90-day cookies and posts them with each website lead. We
-- store them first-touch on the prospect (first non-empty click id wins) and use
-- gclid to upload booked/signed offline conversions back to Google Ads.
--
-- All columns nullable, all guards IF NOT EXISTS — safe to re-run (the
-- migrate-on-deploy runner also tracks applied files in _app_migrations).

ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "gclid" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "gbraid" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "wbraid" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "fbclid" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "utm_source" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "utm_medium" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "utm_campaign" text;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "click_ids" jsonb;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "google_booked_conversion_uploaded_at" timestamptz;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "google_signed_conversion_uploaded_at" timestamptz;

CREATE INDEX IF NOT EXISTS "prospects_gclid_idx" ON "prospects" ("gclid");
