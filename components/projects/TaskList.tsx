"use client";

/**
 * TaskList — a Monday.com / spreadsheet-style grid of a project's tasks.
 *
 * Replaces the old card-list + edit-drawer. Every cell is editable inline
 * and saves on the spot (optimistic, reverts on error): click the name to
 * rename, pick an owner, flip the colored status, set a due date, drag the
 * progress. Sub-tasks indent under their parent. An "add a task" row sits
 * at the bottom of each level.
 *
 * Same exports (TaskList / TaskRow / TaskMember) as before, so the project
 * pages need no changes.
 */

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createTask, deleteTask, updateTask } from "@/lib/actions/projects";

type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "Working on it",
  done: "Done",
  blocked: "Blocked",
};

// Monday-style full-cell colors. Brand palette: green = done, orange =
// working, red = blocked, neutral = to do.
const STATUS_CELL: Record<TaskStatus, string> = {
  todo: "bg-tbb-line-soft text-tbb-ink-2",
  in_progress: "bg-tbb-orange text-white",
  done: "bg-tbb-success text-white",
  blocked: "bg-tbb-danger text-white",
};

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];

export type TaskMember = { id: string; fullName: string };

export type TaskRow = {
  id: string;
  parentTaskId: string | null;
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

  const tops = tasks.filter((t) => !t.parentTaskId);
  const childrenByParent = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (t.parentTaskId) {
      const arr = childrenByParent.get(t.parentTaskId) ?? [];
      arr.push(t);
      childrenByParent.set(t.parentTaskId, arr);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          Tasks
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground tabular-nums">
          {tasks.filter((t) => t.status === "done").length}/{tasks.length} done
        </span>
      </div>

      <div className="overflow-x-auto border border-tbb-line rounded-lg bg-white shadow-tbb-xs">
        <table className="w-full border-collapse text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-tbb-line bg-tbb-cream-50">
              <Th className="text-left pl-4 w-[40%]">Task</Th>
              <Th className="text-left w-[18%]">Owner</Th>
              <Th className="text-center w-[15%]">Status</Th>
              <Th className="text-left w-[14%]">Due</Th>
              <Th className="text-left w-[13%]">Progress</Th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {tops.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-muted-foreground italic"
                >
                  No tasks yet{canEdit ? " — add your first below." : "."}
                </td>
              </tr>
            )}
            {tops.map((t) => {
              const subs = childrenByParent.get(t.id) ?? [];
              return (
                <TaskRowGroup
                  key={t.id}
                  task={t}
                  subs={subs}
                  members={members}
                  canEdit={canEdit}
                  projectId={projectId}
                  onError={setError}
                />
              );
            })}
            {canEdit && (
              <AddTaskRow projectId={projectId} onError={setError} />
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <p role="alert" className="font-sans text-sm text-tbb-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function TaskRowGroup({
  task,
  subs,
  members,
  canEdit,
  projectId,
  onError,
}: {
  task: TaskRow;
  subs: TaskRow[];
  members: TaskMember[];
  canEdit: boolean;
  projectId: string;
  onError: (e: string | null) => void;
}) {
  return (
    <>
      <TaskGridRow
        task={task}
        members={members}
        canEdit={canEdit}
        onError={onError}
        depth={0}
      />
      {subs.map((s) => (
        <TaskGridRow
          key={s.id}
          task={s}
          members={members}
          canEdit={canEdit}
          onError={onError}
          depth={1}
        />
      ))}
      {canEdit && (
        <AddTaskRow
          projectId={projectId}
          parentTaskId={task.id}
          onError={onError}
        />
      )}
    </>
  );
}

function TaskGridRow({
  task,
  members,
  canEdit,
  onError,
  depth,
}: {
  task: TaskRow;
  members: TaskMember[];
  canEdit: boolean;
  onError: (e: string | null) => void;
  depth: number;
}) {
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeUserProfileId ?? "");
  const [dueDate, setDueDate] = useState(
    task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "",
  );
  const [percent, setPercent] = useState(task.percentComplete);
  const [isPending, startTransition] = useTransition();

  // Generic single-field save with optimistic revert.
  function save(patch: Parameters<typeof updateTask>[1], revert: () => void) {
    onError(null);
    startTransition(async () => {
      const r = await updateTask(task.id, patch);
      if (!r.ok) {
        onError(r.error);
        revert();
      }
    });
  }

  const onStatus = (next: TaskStatus) => {
    const prev = status;
    setStatus(next);
    // Completing a task fills the bar; mirrors the old behavior.
    if (next === "done") setPercent(100);
    save(
      { status: next, ...(next === "done" ? { percentComplete: 100 } : {}) },
      () => {
        setStatus(prev);
      },
    );
  };

  const onTitleBlur = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(task.title);
      return;
    }
    if (trimmed === task.title) return;
    save({ title: trimmed }, () => setTitle(task.title));
  };

  const onAssignee = (id: string) => {
    const prev = assigneeId;
    setAssigneeId(id);
    save({ assigneeUserProfileId: id || null }, () => setAssigneeId(prev));
  };

  const onDue = (d: string) => {
    const prev = dueDate;
    setDueDate(d);
    save({ dueDate: d || null }, () => setDueDate(prev));
  };

  const onPercent = (n: number) => {
    const prev = percent;
    setPercent(n);
    save({ percentComplete: n }, () => setPercent(prev));
  };

  const onDeleteRow = () => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    onError(null);
    startTransition(async () => {
      const r = await deleteTask(task.id);
      if (!r.ok) onError(r.error);
    });
  };

  const overdue =
    task.dueDate && dueDate && new Date(dueDate) < new Date() && status !== "done";

  return (
    <tr className="border-b border-tbb-line-soft last:border-0 hover:bg-tbb-cream-50/60 group">
      {/* Task name */}
      <td className="py-1.5 pl-4 pr-2 align-middle">
        <div
          className="flex items-center gap-2"
          style={{ paddingLeft: depth * 18 }}
        >
          {depth > 0 && (
            <span className="text-tbb-ink-4 select-none" aria-hidden>
              ↳
            </span>
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={onTitleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            disabled={!canEdit || isPending}
            className={
              "w-full bg-transparent rounded px-1 py-1 font-sans text-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:bg-white disabled:cursor-default " +
              (status === "done" ? "line-through text-tbb-ink-3" : "")
            }
          />
        </div>
      </td>

      {/* Owner */}
      <td className="py-1.5 px-2 align-middle">
        <select
          value={assigneeId}
          onChange={(e) => onAssignee(e.target.value)}
          disabled={!canEdit || isPending}
          className="w-full bg-transparent rounded px-1 py-1 text-xs text-tbb-ink-2 focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:bg-white cursor-pointer disabled:cursor-default"
        >
          <option value="">—</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>
      </td>

      {/* Status — full-cell color, Monday-style */}
      <td className="py-1.5 px-1.5 align-middle">
        <div className="relative">
          <select
            value={status}
            onChange={(e) => onStatus(e.target.value as TaskStatus)}
            disabled={!canEdit || isPending}
            aria-label="Status"
            className={
              "w-full appearance-none text-center rounded-md px-2 py-1.5 text-[11px] font-bold uppercase tracking-tbb-caps cursor-pointer disabled:cursor-default focus:outline-none focus:ring-2 focus:ring-tbb-navy " +
              STATUS_CELL[status]
            }
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s} className="bg-white text-tbb-ink">
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </td>

      {/* Due date */}
      <td className="py-1.5 px-2 align-middle">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => onDue(e.target.value)}
          disabled={!canEdit || isPending}
          className={
            "w-full bg-transparent rounded px-1 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:bg-white cursor-pointer disabled:cursor-default " +
            (overdue ? "text-tbb-danger font-bold" : "text-tbb-ink-2")
          }
        />
      </td>

      {/* Progress */}
      <td className="py-1.5 px-2 align-middle">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-tbb-line-soft overflow-hidden">
            <div
              className="h-full bg-tbb-success transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          {canEdit ? (
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={percent}
              onChange={(e) =>
                onPercent(
                  Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                )
              }
              disabled={isPending}
              className="w-12 bg-transparent rounded px-1 py-0.5 text-[11px] tabular-nums text-right text-tbb-ink-2 focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:bg-white"
            />
          ) : (
            <span className="w-10 text-[11px] tabular-nums text-right text-tbb-ink-3">
              {percent}%
            </span>
          )}
        </div>
      </td>

      {/* Delete */}
      <td className="py-1.5 pr-2 align-middle text-right">
        {canEdit && (
          <button
            type="button"
            onClick={onDeleteRow}
            disabled={isPending}
            aria-label={`Delete task ${task.title}`}
            className="p-1 rounded text-transparent group-hover:text-tbb-ink-4 hover:!text-tbb-danger hover:bg-tbb-cream-50"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-tbb-ink-4" aria-hidden />
            ) : (
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

function AddTaskRow({
  projectId,
  parentTaskId,
  onError,
}: {
  projectId: string;
  parentTaskId?: string;
  onError: (e: string | null) => void;
}) {
  const isSub = Boolean(parentTaskId);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!title.trim()) return;
    onError(null);
    startTransition(async () => {
      const r = await createTask({
        projectId,
        parentTaskId: parentTaskId ?? null,
        title: title.trim(),
      });
      if (!r.ok) onError(r.error);
      else setTitle("");
    });
  };

  return (
    <tr className="border-b border-tbb-line-soft last:border-0 bg-tbb-cream-50/40">
      <td colSpan={6} className="py-1.5 pl-4 pr-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2"
          style={{ paddingLeft: isSub ? 18 : 0 }}
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-tbb-ink-4" aria-hidden />
          ) : (
            <Plus className="w-3.5 h-3.5 text-tbb-ink-4" aria-hidden />
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
            placeholder={isSub ? "Add a sub-task…" : "Add a task…"}
            className="flex-1 bg-transparent rounded px-1 py-1 text-sm placeholder:text-tbb-ink-4 focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:bg-white"
          />
          {title.trim() && (
            <button
              type="submit"
              disabled={isPending}
              className="text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          )}
        </form>
      </td>
    </tr>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        "px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-muted-foreground " +
        className
      }
    >
      {children}
    </th>
  );
}
