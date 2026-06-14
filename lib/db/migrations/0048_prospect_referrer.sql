-- Who referred a prospect. Required at the form layer when lead source is
-- "Referral"; drives the $50 gift-certificate / thank-you reminder when the
-- referred prospect converts to an active engagement.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS referrer_name text;
