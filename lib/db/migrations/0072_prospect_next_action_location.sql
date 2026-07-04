-- Follow-ups can now carry a location (address / meeting place). Nullable
-- free text; Google Places autocomplete fills it on the client when
-- configured, but any string is valid.
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "next_action_location" text;
