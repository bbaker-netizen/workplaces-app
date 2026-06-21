-- Per-event email notifications: a "new message" notification type so
-- thread participants (other than the author / mentioned users) get a
-- notification + email when a message is posted.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'message';
