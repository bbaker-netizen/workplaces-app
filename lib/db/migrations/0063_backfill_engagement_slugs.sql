-- Backfill engagement slugs so every client has a working per-client
-- "View portal" / preview link (the button only renders when slug is set;
-- without it, preview falls back to the most-recent engagement and a coach
-- can't switch to that specific client).
--
-- Mirrors slugify(name, id) in lib/actions/activate-engagement.ts:
--   <name lowercased, non-alphanumerics -> '-', trimmed of '-'> '-' <id[0:6]>
-- Falls back to the id when the name yields an empty slug.
UPDATE engagements
SET slug = CASE
  WHEN trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g')) = ''
    THEN substr(id::text, 1, 12)
  ELSE trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g'))
       || '-' || substr(id::text, 1, 6)
END
WHERE slug IS NULL OR slug = '';
