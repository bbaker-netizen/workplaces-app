"use client";

/**
 * TaskList — inline-editable list of tasks for a project.
 *
 * Each row supports: status pill (inline native select), edit drawer
 * for title/description/due/percent, delete. New task form at the
 * bottom.
 */

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  createTask,
  deleteTask,
  updateTask,
} from "@/lib/actions/projects";

type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

export type TaskMember = { id: string; fullName: string };

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigneeUserProfileId: string | null;
  assigneeName: string | null;
  dueDate: Date | null;
  percentComplete: number;
};

export function TaskList({
  projectId,
  tasks,
  members,
  canEdit,
}: {
  projectId: string;
  tasks: TaskRow[];
  members: TaskMember[];
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <h2 className="font-bold text-foreground text-xl tracking-tight">
        Tasks
      </h2>
      {tasks.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground italic">
          No tasks yet.
        </p>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {tasks.map((t) => (
            <TaskRowView
              key={t.id}
              task={t}
              members={members}
              canEdit={canEdit}
              onError={setError}
            />
          ))}
        </ul>
      )}
      {canEdit && <NewTaskForm projectId={projectId} onError={setError} />}
      {error && (
        <p role="alert" className="font-sans text-sm text-tbb-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function TaskRowView({
  task,
  members,
  canEdit,
  onError,
}: {
  task: TaskRow;
  members: TaskMember[];
  canEdit: boolean;
  onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState(
    task.assigneeUserProfileId ?? "",
  );
  const [dueDate, setDueDate] = useState(
    task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "",
  );
  const [percent, setPercent] = useState(task.percentComplete);
  const [isPending, startTransition] = useTransition();

  const onPillChange = (next: TaskStatus) => {
    onError(null);
    setStatus(next);
    startTransition(async () => {
      const result = await updateTask(task.id, {
        status: next,
        ...(next === "done" ? { percentComplete: 100 } : {}),
      });
      if (!result.ok) {
        onError(result.error);
        setStatus(task.status);
      }
    });
  };

  const save = () => {
    onError(null);
    if (!title.trim()) {
      onError("Title can't be empty.");
      return;
    }
    startTransition(async () => {
      const result = await updateTask(task.id, {
        title: title.trim(),
        status,
        assigneeUserProfileId: assigneeId || null,
        dueDate: dueDate || null,
        percentComplete: percent,
      });
      if (!result.ok) onError(result.error);
      else setEditing(false);
    });
  };

  const onDeleteRow = () => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    onError(null);
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (!result.ok) onError(result.error);
    });
  };

  const isOverdue =
    task.dueDate && task.dueDate < new Date() && task.status !== "done";

  return (
    <li className="py-3">
      {editing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
          <div className="grid sm:grid-cols-2 gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isPending}
              className="bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                Progress
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                disabled={isPending}
                className="flex-1 accent-[#2E4057]"
              />
              <span className="font-mono text-[11px] tabular-nums text-foreground w-10 text-right">
                {percent}%
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          {/* Status pill (inline select for quick updates). */}
          <select
            value={status}
            onChange={(e) =>
              canEdit && onPillChange(e.target.value as TaskStatus)
            }
            disabled={!canEdit || isPending}
            className={
              "shrink-0 font-mono text-[10px] uppercase tracking-tbb-caps font-bold border rounded-full px-2 py-1 cursor-pointer disabled:cursor-default " +
              (status === "done"
                ? "border-tbb-blue text-tbb-navy bg-tbb-cream-50"
                : status === "blocked"
                  ? "border-tbb-danger text-tbb-danger bg-tbb-cream-50"
                  : "border-tbb-line text-foreground bg-white")
            }
          >
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => canEdit && setEditing(true)}
              disabled={!canEdit}
              className="text-left w-full"
            >
              <p className="font-sans text-sm font-bold text-foreground">
                {task.title}
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                {task.assigneeName && <>{task.assigneeName} · </>}
                {task.dueDate && (
                  <span
                    className={isOverdue ? "text-tbb-danger font-bold" : ""}
                  >
                    Due {task.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {" · "}
                  </span>
                )}
                <span>{task.percentComplete}% complete</span>
              </p>
            </button>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onDeleteRow}
              disabled={isPending}
              aria-label={`Delete task ${task.title}`}
              className="p-1.5 rounded text-muted-foreground hover:text-tbb-danger hover:bg-tbb-cream-50"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function NewTaskForm({
  projectId,
  onError,
}: {
  projectId: string;
  onError: (e: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!title.trim()) return;
    onError(null);
    startTransition(async () => {
      const result = await createTask({
        projectId,
        title: title.trim(),
      });
      if (!result.ok) onError(result.error);
      else setTitle("");
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 pt-3"
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={isPending}
        placeholder="Add a task…"
        className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
      />
      <button
        type="submit"
        disabled={isPending || !title.trim()}
        className="inline-flex items-center gap-1 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Plus className="w-3.5 h-3.5" aria-hidden />
        )}
        Add
      </button>
    </form>
  );
}
