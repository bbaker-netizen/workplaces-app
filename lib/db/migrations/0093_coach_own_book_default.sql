-- Own-book-by-default becomes a real boundary, not a view default.
--
-- Background: `all_clients_access` defaulted to TRUE for every Business
-- Builder, which made the earlier "scope to my own clients" work cosmetic —
-- a coach holding the flag was offered the "All clients" toggle (one click,
-- the whole practice's book) and could also open any client straight from a
-- URL, because `canCurrentBbAccessEngagement` short-circuits on the flag.
--
-- After this migration a coach's reach is derived from OWNERSHIP:
-- engagements where they are the assigned coach, plus anything explicitly
-- granted in `bb_client_access`, plus the practice's internal workspace.
-- `all_clients_access` becomes an opt-in the master admin turns ON from
-- Settings -> Team access, rather than the state everyone starts in.
--
-- master_admin rows are left alone — the master admin always has full reach
-- and keeps the All-clients toggle.

-- New Business Builders start scoped to their own book.
ALTER TABLE user_profiles ALTER COLUMN all_clients_access SET DEFAULT false;

-- Existing coaches: drop the blanket grant they were created with. This is
-- the line that actually changes what Jen can see today. Reversible from the
-- Team access page if a practice-wide coach is ever wanted.
UPDATE user_profiles
   SET all_clients_access = false
 WHERE role = 'coach'
   AND all_clients_access = true;

-- Belt and braces: the master admin must never be scoped out of anything.
UPDATE user_profiles
   SET all_clients_access = true
 WHERE role = 'master_admin'
   AND all_clients_access = false;

-- Pending invites carry their own copy of the access settings and would
-- otherwise be the back door that hands the next Business Builder the whole
-- book on their first sign-in.
ALTER TABLE bb_invite_access ALTER COLUMN all_clients_access SET DEFAULT false;
