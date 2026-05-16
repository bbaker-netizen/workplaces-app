-- 0030_engagement_drive_folder.sql
-- Bruce links a Google Drive folder per engagement; the engagement
-- documents page lists the folder's files alongside uploaded ones.
-- Read-only — the app never writes to Drive.

ALTER TABLE "engagements"
  ADD COLUMN IF NOT EXISTS "google_drive_folder_id" text;

ALTER TABLE "engagements"
  ADD COLUMN IF NOT EXISTS "google_drive_folder_name" text;

ALTER TABLE "engagements"
  ADD COLUMN IF NOT EXISTS "google_drive_linked_by_user_profile_id" uuid
  REFERENCES "user_profiles"("id") ON DELETE SET NULL;

ALTER TABLE "engagements"
  ADD COLUMN IF NOT EXISTS "google_drive_linked_at" timestamptz;
