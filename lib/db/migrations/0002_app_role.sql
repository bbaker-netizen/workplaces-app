-- Phase 0 — runtime role with NOBYPASSRLS for tenant-scoped queries.
-- See docs/decisions.md "Dual-role pattern: neondb_owner for migrations,
-- workplaces_app for runtime + tests".
--
-- Pattern: every tenant-scoped transaction does
--   SET LOCAL ROLE workplaces_app;
--   SELECT set_config('app.current_org_id', '<uuid>', true);
-- so the active role is subject to RLS (BYPASSRLS gone) and the GUC
-- feeds auth.org_id() for the policy predicate.
--
-- neondb_owner stays untouched (it has BYPASSRLS, used for migrations
-- and admin scripts only). workplaces_app is granted to neondb_owner so
-- the existing connection can SET LOCAL ROLE without a separate login.

CREATE ROLE workplaces_app NOBYPASSRLS NOLOGIN;--> statement-breakpoint
GRANT workplaces_app TO neondb_owner;--> statement-breakpoint
GRANT USAGE ON SCHEMA public, auth TO workplaces_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workplaces_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.org_id() TO workplaces_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO workplaces_app;
