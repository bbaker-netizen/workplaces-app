-- Preferred name on a lead — what they actually go by.
--
-- 0098 split the single contact name into first and last. This adds the
-- third piece: a Robert who introduces himself as Bob, a Siobhán who uses
-- Sam with English speakers, someone using a middle name. Addressing a
-- contract or an email to the name on their driving licence rather than the
-- one they gave you reads as a mailmerge, which is the opposite of what
-- these templates are for.
--
-- Deliberately NOT backfilled. A preferred name is something a person tells
-- you; guessing it from the first name would fill the column with values
-- nobody chose, and then there'd be no way to tell a real preference from a
-- default. Null means "no preference recorded", and the templates fall back
-- to the first name.
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS contact_preferred_name text;
