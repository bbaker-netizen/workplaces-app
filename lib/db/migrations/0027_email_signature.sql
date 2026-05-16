-- 0027_email_signature.sql
-- Per-user email signature appended to outgoing emails sent from the
-- communications panel. Plain text (will be appended to plain-text body).

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "email_signature" text;
