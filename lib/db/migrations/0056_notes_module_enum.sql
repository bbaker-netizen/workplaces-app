-- Add the 'notes' value to the portal_module enum.
--
-- This MUST be the only statement in the file: Postgres forbids
-- `ALTER TYPE ... ADD VALUE` inside a transaction block, and the
-- migrate-on-deploy runner executes each file as a single multi-statement
-- (implicitly transactional) blob. A lone statement runs auto-committed,
-- outside any transaction, so this succeeds.
ALTER TYPE "public"."portal_module" ADD VALUE IF NOT EXISTS 'notes';
