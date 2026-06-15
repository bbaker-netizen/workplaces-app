-- Full two-way Google Drive: app-created "managed" folders + linking the
-- app's document rows to the Drive file they were mirrored to.
ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS google_drive_managed boolean NOT NULL DEFAULT false;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS google_drive_file_id text,
  ADD COLUMN IF NOT EXISTS google_drive_web_link text;
