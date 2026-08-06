-- A dark booking page, visible to the person whose page it is.
--
-- `listAvailableSlots` fails CLOSED: when a Business Builder's calendar
-- cannot be read they are treated as fully busy, so the public page
-- offers nothing. That is the intended behaviour — a page showing no
-- times is recoverable, one that double-books a client session is not.
--
-- What was missing is that the failure was silent to its OWNER. Nothing
-- anywhere recorded that a page had stopped offering times, so "booked
-- solid", "Google disconnected" and "the calendar read is erroring"
-- looked identical from the console, and the first person to notice
-- would have been a prospect who gave up. Same failure shape as every
-- silent cron in this codebase, on a surface a stranger sees.
--
-- These three columns are the run record for that read. Written by the
-- PUBLIC page load, so what the console reports is the outcome a real
-- visitor actually got, not a probe we ran on the console's behalf under
-- different conditions.
--
-- Nullable with no default and no backfill: "nobody has loaded this page
-- since the column existed" is a real and distinct state, and inventing
-- a healthy-looking value for it would be a lie the console then
-- repeats.

ALTER TABLE scheduling_links
  ADD COLUMN IF NOT EXISTS last_availability_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_availability_ok boolean,
  ADD COLUMN IF NOT EXISTS last_availability_reason text,
  ADD COLUMN IF NOT EXISTS last_availability_error text;
