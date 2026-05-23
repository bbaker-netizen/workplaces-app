-- Phase 5.6 — Wire goals → projects → action items into a tree.
--
-- Today the three tables each have engagement_id only, so they're
-- three independent flat lists. To support the Workspace tab on
-- the engagement page (goal at top → projects under each goal →
-- action items under each project), we add two optional foreign
-- keys:
--
--   1. projects.goal_id → goals.id  (a project can support a goal,
--      or stand alone — nullable)
--   2. action_items.project_id → projects.id  (an action item can
--      be part of a project, or one-off — nullable)
--
-- Both ON DELETE SET NULL: deleting a parent goal / project just
-- detaches its children, doesn't cascade-delete the work.
--
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'goal_id'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;
    CREATE INDEX projects_goal_idx ON projects(goal_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'action_items'
      AND column_name = 'project_id'
  ) THEN
    ALTER TABLE action_items
      ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
    CREATE INDEX action_items_project_idx ON action_items(project_id);
  END IF;
END $$;
