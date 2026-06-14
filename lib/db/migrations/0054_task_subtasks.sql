-- Sub-tasks: a task can hang off a parent task. Null parent = top-level.
-- Deleting a parent cascades to its sub-tasks.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_parent_task_id_tasks_id_fk
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE cascade;
CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks (parent_task_id);
