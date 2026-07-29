-- Pre-authorized debit (PAD) authorization, carried by the existing
-- e-signing flow rather than a second signing system beside it.
--
-- A PAD request IS a signature envelope: same table, same public token,
-- same completion pipeline, same filing onto the client's documents. The
-- only thing e-signing couldn't already do was collect typed answers from
-- the signer, which is what `field_values_encrypted` adds.
--
-- ENCRYPTED, NOT JSONB. The captured values are a bank transit and account
-- number. Stored as plain jsonb they would be readable by every query that
-- touches a signer row, and would land in any log or error dump that
-- serialised one. They go through the same secret vault as the stored
-- Anthropic keys and are decrypted at exactly one point: rendering the
-- completed PDF. Nothing in the console ever displays them back.
--
-- `kind` distinguishes a payment authorization from an agreement so the
-- sign page knows to ask for the fields, and so the client's record can
-- show the two separately.
ALTER TABLE signature_envelopes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'agreement';

ALTER TABLE signature_signers
  ADD COLUMN IF NOT EXISTS field_values_encrypted text;

CREATE INDEX IF NOT EXISTS signature_envelopes_kind_idx
  ON signature_envelopes (org_id, kind);

-- Card details are never collected by this application. The practice's
-- hosted payment page (QuickBooks Payments or Stripe) is linked instead,
-- so card numbers go straight to the processor and never touch our
-- database. One URL for the practice, set alongside the other billing
-- defaults.
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS card_payment_url text;
