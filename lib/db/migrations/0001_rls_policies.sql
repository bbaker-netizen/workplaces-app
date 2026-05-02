-- Phase 0 RLS — tenant isolation via Postgres Row-Level Security.
-- See docs/decisions.md "Multi-tenancy: Clerk Organizations + Postgres RLS".
--
-- Pattern: Next.js middleware reads the active orgId from the Clerk
-- session and runs `set_config('app.current_org_id', '<uuid>', true)`
-- inside a transaction at request boundary. Drizzle queries inside that
-- transaction see the GUC; RLS policies use auth.org_id() to read it.
--
-- FORCE ROW LEVEL SECURITY makes the policies bind even for the table
-- owner (neondb_owner), so seeds and admin scripts must also set the
-- GUC. This is the desired safety default.

CREATE SCHEMA IF NOT EXISTS auth;--> statement-breakpoint

-- auth.org_id(): read the session-level GUC, return uuid or NULL.
-- Returns NULL gracefully on unset, empty, or malformed values
-- (which means policies match nothing — fail-closed).
CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text := current_setting('app.current_org_id', true);
BEGIN
  IF v IS NULL OR v = '' THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA auth TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.org_id() TO PUBLIC;--> statement-breakpoint

-- orgs: the tenant table. RLS on `id` (the tenant discriminator).
-- Bootstrap an org by SET-ing the GUC to the new org's pre-generated
-- UUID before INSERT, so WITH CHECK (id = auth.org_id()) passes.
ALTER TABLE "orgs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orgs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "orgs_tenant_isolation" ON "orgs"
  FOR ALL
  USING (id = auth.org_id())
  WITH CHECK (id = auth.org_id());--> statement-breakpoint

-- user_profiles, coaches, engagements: RLS on `org_id`.
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_profiles_tenant_isolation" ON "user_profiles"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());--> statement-breakpoint

ALTER TABLE "coaches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coaches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "coaches_tenant_isolation" ON "coaches"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());--> statement-breakpoint

ALTER TABLE "engagements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engagements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "engagements_tenant_isolation" ON "engagements"
  FOR ALL
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());
