-- 0042: add a target_date column to deliverables so they can be
-- planned (and plotted on the Gantt as milestone diamonds) before
-- they're actually delivered.
--
-- deliveredAt stays as the moment-of-truth completion timestamp; the
-- new target_date is the planning target the coach sets when they
-- queue up the deliverable. Gantt plots delivered ones at
-- deliveredAt and not-yet-delivered ones at target_date.
--
-- Idempotent.

ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS target_date timestamptz;

CREATE INDEX IF NOT EXISTS deliverables_target_date_idx
  ON deliverables (target_date);
