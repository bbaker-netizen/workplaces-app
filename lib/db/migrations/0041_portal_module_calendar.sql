-- 0041: extend the portal_module enum to include "calendar" so the
-- new Calendar module can be toggled per-engagement by the coach.
--
-- The enum is referenced by portal_module_assignments.module. Without
-- this addition, attempting to disable Calendar via the per-engagement
-- module toggle UI would fail at the DB layer with "invalid input
-- value for enum portal_module".
--
-- Idempotent: skip if already present.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'calendar'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'portal_module'
      )
  ) THEN
    ALTER TYPE portal_module ADD VALUE 'calendar';
  END IF;
END
$$;
