-- A second contact on a lead — the client's business partner.
--
-- Real columns rather than a name typed into an email, because both partners
-- often sign the agreement. A signer needs a name AND an email of their own,
-- and the signed record has to show who actually signed. A free-text merge
-- field could never do that.
--
-- Mirrors the primary contact's shape (first / last / preferred / email /
-- phone) so the same helpers compose the display name and the same template
-- variables resolve, rather than the second person being a lesser citizen
-- with different rules.
--
-- All nullable: solo clients are the common case, and the onboarding email
-- adjusts its wording when these are empty.
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS contact2_first_name     text,
  ADD COLUMN IF NOT EXISTS contact2_last_name      text,
  ADD COLUMN IF NOT EXISTS contact2_preferred_name text,
  ADD COLUMN IF NOT EXISTS contact2_email          text,
  ADD COLUMN IF NOT EXISTS contact2_phone          text;
