-- Notification type for a client raising a point for their next session.
--
-- Distinct from `message` on purpose. A message is a conversation the
-- Business Builder can answer whenever; an agenda request is bound to a
-- date, and its whole value is arriving before that date. Reusing
-- `message` would have made the bell say "new message" about something
-- that is really "they want to cover this on Tuesday", and the feed's
-- deep link would have pointed at the wrong page.
--
-- Alone in its own file: the deploy runner sends each migration as a
-- single implicit transaction, and a newly added enum value cannot be
-- used in the transaction that added it. Same reason 0089 was split from
-- 0090, and 0091 from what surrounded it.

ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'agenda_item_raised';
