-- Phase 5.7c — Track external source for synced resources.
--
-- Bruce's tools all live on Netlify. The Tools tab can now sync the
-- catalogue directly from the Netlify API. To make repeat-syncs
-- idempotent (and to preserve any descriptions/tags Bruce has
-- customised), we tag each synced resource with its source platform
-- + the platform's stable id. Subsequent syncs match on
-- (source, source_id) and update title + url but leave the user-
-- editable fields alone.
--
-- source values:
--   'netlify' — Netlify site
--   null — created manually in the app
--
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='resources' AND column_name='source'
  ) THEN
    ALTER TABLE resources ADD COLUMN source text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='resources' AND column_name='source_id'
  ) THEN
    ALTER TABLE resources ADD COLUMN source_id text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='resources' AND column_name='last_synced_at'
  ) THEN
    ALTER TABLE resources ADD COLUMN last_synced_at timestamptz;
  END IF;

  -- One row per (org, source, source_id) so re-syncs upsert instead
  -- of duplicating. NULL source/source_id pairs are allowed (manual
  -- entries) and the unique index ignores them via WHERE clause.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'resources_unique_source'
  ) THEN
    CREATE UNIQUE INDEX resources_unique_source
      ON resources(org_id, source, source_id)
      WHERE source IS NOT NULL AND source_id IS NOT NULL;
  END IF;
END $$;
