-- Per-Business-Builder SMS "from" number. Each Builder texts clients from
-- their OWN Twilio number (set in Settings > Profile) so clients see that
-- Builder, not the shared practice number. E.164 format, e.g. +17809830722.
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "sms_from_number" text;
