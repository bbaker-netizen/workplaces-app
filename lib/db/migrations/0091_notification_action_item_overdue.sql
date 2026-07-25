-- Notification type for the weekly client chase.
--
-- The Monday nudge emailed clients about their overdue commitments but
-- wrote nothing in-app, so a client who works out of the portal rather
-- than their inbox saw no sign of it. The existing due-soon reminder
-- writes a notification row AND emails; this brings the overdue nudge
-- into line.
--
-- Distinct from `action_item_due_soon` on purpose. That one fires BEFORE
-- a date (a heads-up); this one fires after (a chase). Reusing it would
-- have made the bell say "due soon" about something already late.
--
-- Alone in its own file: the deploy runner sends each migration as a
-- single implicit transaction, and a newly added enum value cannot be
-- used in the transaction that added it. Same reason 0089 was split from
-- 0090.

ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'action_item_overdue';
