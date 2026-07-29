-- Person Profile assessment completion, tracked per participant.
--
-- Item 3 of the onboarding email sends each participant to TTI. Both the
-- primary contact and the business partner complete their own.
--
-- MARKED BY HAND, and that is a constraint rather than a shortcut. The TTI
-- link is a single shared survey URL with no per-person identity and no API
-- into this app, so nothing can tell us who completed what. Bruce confirmed
-- the link stays as it is. A Business Builder ticks the box when TTI emails
-- the report through.
--
-- Timestamps rather than booleans: "when" is what makes this useful later.
-- A reminder job — deliberately not built yet — needs to know how long
-- someone has been outstanding, and a boolean would have to be thrown away
-- to add that.
--
-- Mirrors the contact / contact2 split, so participant 2 is the business
-- partner added in 0101.
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS assessment1_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assessment2_completed_at timestamptz;
