-- New approval subject: a proposed session agenda.
--
-- Deliberately alone in its own migration file. The deploy runner sends
-- each file to Postgres as a single multi-statement query, which runs as
-- one implicit transaction, and a newly added enum value cannot be USED
-- in the same transaction that added it. Keeping the ALTER TYPE in its
-- own file guarantees it is committed before migration 0090 creates the
-- table that depends on it — rather than relying on the fact that no
-- statement happens to reference it yet.

ALTER TYPE "public"."ea_approval_subject" ADD VALUE IF NOT EXISTS 'agenda_proposal';
