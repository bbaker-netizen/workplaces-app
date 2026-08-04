-- Notification types for a finalized agenda, and for one that changed
-- after it was finalized.
--
-- Two values rather than one because the two say different things to the
-- person reading the bell. "Finalized" is an invitation: here is what we
-- are covering, add anything you need. "Updated" is a warning: what you
-- already read has changed, look again before you walk in. Collapsing
-- them would make the second indistinguishable from the first, which is
-- exactly the case where re-reading matters.
--
-- Distinct from `agenda_item_raised` (0110), which fires the moment a
-- CLIENT adds a point and is about one item. These two are about the
-- agenda as a whole, are raised deliberately by a Business Builder, and
-- go only to Business Builders.
--
-- Alone in its own file: the deploy runner sends each migration as a
-- single implicit transaction, and a newly added enum value cannot be
-- used in the transaction that added it. Same reason 0110 was split, and
-- 0089 from 0090.

ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'agenda_finalized';
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'agenda_updated';
