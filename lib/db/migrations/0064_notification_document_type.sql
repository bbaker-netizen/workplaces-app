-- Per-event email notifications for shared documents: a "document"
-- notification type so engagement members get a notification + email when
-- a document is uploaded/shared to their engagement.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'document';
