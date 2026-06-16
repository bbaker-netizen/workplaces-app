-- Per-coach "Archive" Drive folder. When a client is archived, the app
-- moves that client's app-managed Drive folder into here. Stored on the
-- coach's Google token row (per-user Drive settings).
ALTER TABLE google_calendar_tokens
  ADD COLUMN IF NOT EXISTS drive_archive_folder_id text;
