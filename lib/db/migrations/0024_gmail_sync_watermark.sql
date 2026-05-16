-- 0024_gmail_sync_watermark.sql
-- Track the last-synced Gmail watermark on the existing google_calendar_tokens
-- row. Reuses the same OAuth grant — gmail.readonly was added to the
-- scope set in code; users re-consent once and we get both calendar
-- writes and Gmail reads.

ALTER TABLE google_calendar_tokens
  ADD COLUMN gmail_sync_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE google_calendar_tokens
  ADD COLUMN gmail_last_synced_at timestamptz;

ALTER TABLE google_calendar_tokens
  ADD COLUMN gmail_last_message_at timestamptz;
