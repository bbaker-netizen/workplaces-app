-- Phase 5.1 — E-signature legal audit upgrades.
--
-- Adds three pieces of evidence to the native signing flow so the
-- generated PDF + audit trail stand up under Alberta's Electronic
-- Transactions Act, Canadian PIPEDA, the US ESIGN Act, and UETA:
--
--   1. `signature_signers.consented_at`  — exact moment the signer
--      ticked the "I agree to sign electronically" consent checkbox.
--      Distinguishes "viewed the doc" from "agreed to e-sign".
--
--   2. `signature_signers.consent_text`  — verbatim snapshot of the
--      consent disclosure the signer saw at the moment they ticked
--      the box. If the wording changes later, we still know what the
--      signer agreed to.
--
--   3. `signature_envelopes.signed_document_hash`  — SHA-256 hex
--      digest of the final signed PDF, written at completion. Lets
--      anyone verify the PDF hasn't been altered since completion.
--
-- All additions are idempotent — safe to re-run on a partially
-- applied DB. No backfill needed; existing rows leave these fields
-- null and operate exactly as before.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_signers'
      AND column_name = 'consented_at'
  ) THEN
    ALTER TABLE signature_signers
      ADD COLUMN consented_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_signers'
      AND column_name = 'consent_text'
  ) THEN
    ALTER TABLE signature_signers
      ADD COLUMN consent_text text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signature_envelopes'
      AND column_name = 'signed_document_hash'
  ) THEN
    ALTER TABLE signature_envelopes
      ADD COLUMN signed_document_hash text;
  END IF;
END $$;
