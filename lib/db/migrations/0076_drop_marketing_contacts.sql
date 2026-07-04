-- Marketing list removed per Bruce — the WordPress contacts were promoted
-- into the pipeline (and relabelled), so the separate marketing list is no
-- longer used. Drop the table and its data. The promoted prospects live in
-- the `prospects` table and are unaffected.
DROP TABLE IF EXISTS "marketing_contacts" CASCADE;
