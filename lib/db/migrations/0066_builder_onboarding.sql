-- 0066: first-login onboarding for Business Builders.
--
-- Adds a per-user "have you been welcomed" timestamp. NULL = show the
-- first-login welcome + setup checklist; set = never show again. Existing
-- users already know the app, so backfill them to now() — only freshly
-- invited Business Builders (like Jen) see the checklist. Additive +
-- idempotent (the runner applies each file exactly once).

ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;

UPDATE "user_profiles"
   SET "onboarding_completed_at" = now()
 WHERE "onboarding_completed_at" IS NULL;
