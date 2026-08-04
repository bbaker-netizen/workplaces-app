-- A recap you decided not to send.
--
-- Bruce's ask: be able to delete the client-facing session notes while
-- still releasing the Fireflies transcript to the client. Some sessions
-- do not warrant a written recap; the transcript on its own is the
-- deliverable.
--
-- A soft status rather than a DELETE, and that is the whole point. The
-- recap sweep decides what to draft by asking whether a `session_recaps`
-- row exists for the session (lib/ea/recap-sweep.ts), so a hard delete
-- would free the slot and the next hourly run would draft the same recap
-- again — discard it in the morning, find it back by lunch. Keeping the
-- row with `status = 'discarded'` holds the slot and states the decision.
--
-- Alone in its own file: the deploy runner sends each migration as a
-- single implicit transaction, and a newly added enum value cannot be
-- used in the transaction that added it. Same reason 0089 was split from
-- 0090, and 0110 from what surrounds it.

ALTER TYPE "public"."session_recap_status" ADD VALUE IF NOT EXISTS 'discarded';
