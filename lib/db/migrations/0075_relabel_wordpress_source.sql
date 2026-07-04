-- The one-time WordPress import tagged leads with source "WordPress", which
-- was only meaningful for the import itself. Relabel to the canonical
-- "Website Form" so those leads group with other website-form leads in the
-- pipeline source filter and Reports. Covers both the promoted prospects
-- (Bruce moved them to Lost) and the marketing_contacts they came from.
-- Idempotent: after this runs, no rows match 'WordPress'.
UPDATE "prospects" SET "lead_source" = 'Website Form' WHERE "lead_source" = 'WordPress';
--> statement-breakpoint
UPDATE "marketing_contacts" SET "source" = 'Website Form' WHERE "source" = 'WordPress';
