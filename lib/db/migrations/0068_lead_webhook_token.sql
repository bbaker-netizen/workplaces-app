-- 0068: lead-capture webhook token.
--
-- A per-account secret that secures the public /api/leads/<token> endpoint.
-- External channels (website form, Meta/TikTok/YouTube/Google/LinkedIn ads
-- via Make.com) POST leads to that URL and they land in the Pipeline as
-- prospects. Lives on the master org. Additive + idempotent.

ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "lead_webhook_token" text;
