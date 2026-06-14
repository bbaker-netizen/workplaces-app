-- Social handles for prospects / clients. LinkedIn is the headline one
-- Bruce asked for; Facebook + Instagram cover the trades/SMB world where
-- a lot of these businesses actually live. All optional, stored as full
-- URLs (the app normalises bare handles/domains to https:// on save).
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS instagram_url text;
