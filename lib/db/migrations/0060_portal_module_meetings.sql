-- 0060: extend the portal_module enum with "meetings" so the new client
-- Meetings module (Fireflies recaps + recording links) can be toggled
-- per-engagement by the coach. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'meetings'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'portal_module'
      )
  ) THEN
    ALTER TYPE portal_module ADD VALUE 'meetings';
  END IF;
END
$$;
