-- 0021_user_ui_prefs.sql
-- Per-user UI preference state. Three columns added to user_profiles so
-- each user's setup follows them across devices:
--   • pinned_nav_items   — array of hrefs the user has favourited in the sidebar
--   • sidebar_collapsed  — whether the lifecycle sidebar is in icon-only mode
--   • pipeline_column_prefs — JSONB blob of visible columns, order, widths
--   • home_dashboard_layout — JSONB blob of dashboard cards + positions
--
-- All four default to empty / sensible-default so existing rows keep working
-- with no backfill required.

ALTER TABLE user_profiles
  ADD COLUMN pinned_nav_items text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE user_profiles
  ADD COLUMN sidebar_collapsed boolean NOT NULL DEFAULT false;

ALTER TABLE user_profiles
  ADD COLUMN pipeline_column_prefs jsonb;

ALTER TABLE user_profiles
  ADD COLUMN home_dashboard_layout jsonb;
