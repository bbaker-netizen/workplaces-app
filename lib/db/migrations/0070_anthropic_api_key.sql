-- Per-user Anthropic API key for Builder Buddy ("Ask Buddy").
-- Each Business Builder supplies their own key so Buddy usage bills to
-- them, not the platform. Stored AES-256-GCM encrypted via secret-vault.
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "anthropic_api_key" text;
