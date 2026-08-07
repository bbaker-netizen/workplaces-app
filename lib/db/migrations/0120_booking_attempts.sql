-- One row per attempt to book through a public /book page, written
-- whether it works or not.
--
-- The failure this catches is silence. On 7 Aug a Business Builder tried
-- three times to book through /book/jen-garrison — slot selected, every
-- field valid — and got nothing back: no booking row, no prospect, no
-- error on screen, and nothing anywhere in the database to say an attempt
-- had even been made. The only trace was a `console.error` in a Netlify
-- log nobody reads.
--
-- So "nobody has tried to book", "they tried and we refused them", and
-- "they tried and the code threw" were one observation from our side: an
-- empty bookings table. On a public revenue path that is the worst place
-- in the app for an absence to be ambiguous — every one of those means
-- something different and only one of them is fine.
--
-- Same doctrine as `ea_job_runs` (0088) and `meeting_draft_runs` (0115).
-- Like the latter this is tenant data and carries `org_id` with the
-- standard policy.
--
-- `org_id` and `scheduling_link_id` are NULLABLE on purpose: an attempt
-- against a slug that resolves to nothing has no org to attribute to, and
-- that is precisely the attempt worth keeping. Recording it under a
-- guessed org would be worse than recording it under none. `slug` is
-- always present because it is what the visitor actually asked for.

CREATE TABLE IF NOT EXISTS booking_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES orgs(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: `bookings` cascades from its link because a
  -- booking is meaningless without one, but the record that someone
  -- TRIED to book is evidence about the funnel and outlives the link.
  -- `slug` below keeps it readable after the link is gone.
  scheduling_link_id uuid REFERENCES scheduling_links(id) ON DELETE SET NULL,
  slug text NOT NULL,
  -- What they asked for. Nullable because an unparseable time is itself
  -- one of the failures this table exists to catch.
  requested_start timestamptz,
  booker_name text,
  booker_email text,
  -- booked | refused | error.
  --   booked  — a row landed in `bookings`.
  --   refused — we said no on purpose (slot taken, time passed, link off).
  --   error   — something threw. Always a bug, never the visitor's fault.
  -- Text rather than an enum: operational detail with no foreign readers,
  -- and an enum would need its own migration every time a state is added.
  outcome text NOT NULL,
  -- Short machine-ish label for grouping (e.g. 'slot-taken').
  reason text,
  -- The sentence the visitor was shown, or the error text. This is the
  -- field that turns "it didn't work" into a diagnosis.
  detail text,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The console wants the most recent attempts for one link, and the
-- practice-wide recent list. Both lead with time descending.
CREATE INDEX IF NOT EXISTS booking_attempts_link_idx
  ON booking_attempts (scheduling_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_attempts_created_idx
  ON booking_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS booking_attempts_org_idx
  ON booking_attempts (org_id);

ALTER TABLE booking_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_attempts_tenant ON booking_attempts;
CREATE POLICY booking_attempts_tenant
  ON booking_attempts
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON booking_attempts TO workplaces_app;
