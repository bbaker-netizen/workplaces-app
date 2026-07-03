-- 0069: add the new pipeline stages for the reordered ladder.
-- ADD VALUE only (no usage in this file) so it's safe in one transaction.
-- The data remap that USES these values lives in 0070 (a later file = a
-- separate transaction), per Postgres's "can't use a new enum value in the
-- same transaction it was added" rule.

ALTER TYPE "prospect_status" ADD VALUE IF NOT EXISTS 'contact_attempted';
ALTER TYPE "prospect_status" ADD VALUE IF NOT EXISTS 'appt_completed_followup';
ALTER TYPE "prospect_status" ADD VALUE IF NOT EXISTS 'not_qualified';
