"use client";

/**
 * AgendaBoard — the agenda for one meeting.
 *
 * Add a talking point, reorder, mark it discussed or deferred, and turn
 * any point into a commitment tasked to a teammate. The linked action
 * items render underneath the point they came from, which is the whole
 * reason this screen exists: you can see what was said AND who owes
 * what because of it, in one place.
 *
 * Reorder is arrow-based rather than drag: it works on touch, needs no
 * dependency, and an agenda is short enough that nudging beats dragging.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CornerDownRight,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  carryForwardAgenda,
  createAgendaItem,
  deleteAgendaItem,
  reorderAgendaItems,
  setAgendaItemStatus,
  updateAgendaItem,
} from "@/lib/actions/agenda-items";
import { createActionItem } from "@/lib/actions/action-items";
import type { ListedAgendaItem } from "@/lib/db/queries/agenda-items";
import type { InternalTeammate } from "@/lib/db/queries/internal-workspace";

type Props = {
  sessionId: string;
  engagementId: string;
  items: ListedAgendaItem[];
  teammates: InternalTeammate[];
  currentUserProfileId: string;
  /** False on past/cancelled meetings — agenda becomes read-only. */
  canEdit?: boolean;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-tbb-navy/10 text-tbb-navy",
  discussed: "bg-tbb-success/15 text-tbb-success",
  deferred: "bg-tbb-orange/15 text-tbb-orange",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "To discuss",
  discussed: "Discussed",
  deferred: "Carried",
};

export function AgendaBoard({
  sessionId,
  engagementId,
  items,
  teammates,
  currentUserProfileId,
  canEdit = true,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [taskingFor, setTaskingFor] = useState<string | null>(null);

  const pendingCount = items.filter((i) => i.status === "pending").length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    run(() => createAgendaItem({ bbsSessionId: sessionId, title }));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    run(() =>
      reorderAgendaItems({
        bbsSessionId: sessionId,
        orderedIds: next.map((i) => i.id),
      }),
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
          Agenda
          {pendingCount > 0 && (
            <span className="ml-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              {pendingCount} to discuss
            </span>
          )}
        </h2>
        {canEdit && pendingCount > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => carryForwardAgenda(sessionId))}
            className="font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline underline-offset-4 disabled:opacity-50"
          >
            Carry unfinished items to next meeting
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-tbb-orange/10 border border-tbb-orange/30 px-3 py-2 font-sans text-sm text-tbb-orange"
        >
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-tbb-line bg-white p-6 text-center font-sans text-sm text-muted-foreground">
          Nothing on the agenda yet. Add the first talking point below.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, index) => (
            <AgendaRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              canEdit={canEdit}
              busy={pending}
              teammates={teammates}
              isTasking={taskingFor === item.id}
              onToggleTasking={() =>
                setTaskingFor(taskingFor === item.id ? null : item.id)
              }
              onMove={move}
              onRun={run}
              sessionId={sessionId}
              engagementId={engagementId}
              currentUserProfileId={currentUserProfileId}
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a talking point…"
            maxLength={500}
            className="flex-1 rounded-lg border border-tbb-line bg-white px-3 py-2 font-sans text-sm text-tbb-navy placeholder:text-tbb-ink-3 focus:border-tbb-blue focus:outline-none focus:ring-1 focus:ring-tbb-blue"
          />
          <button
            type="submit"
            disabled={pending || newTitle.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-tbb-navy px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-white hover:bg-tbb-blue disabled:opacity-50 transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="w-3.5 h-3.5" aria-hidden />
            )}
            Add
          </button>
        </form>
      )}
    </section>
  );
}

function AgendaRow({
  item,
  index,
  total,
  canEdit,
  busy,
  teammates,
  isTasking,
  onToggleTasking,
  onMove,
  onRun,
  sessionId,
  engagementId,
  currentUserProfileId,
}: {
  item: ListedAgendaItem;
  index: number;
  total: number;
  canEdit: boolean;
  busy: boolean;
  teammates: InternalTeammate[];
  isTasking: boolean;
  onToggleTasking: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  sessionId: string;
  engagementId: string;
  currentUserProfileId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body ?? "");

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditing(false);
    onRun(() =>
      updateAgendaItem(item.id, {
        title: title.trim(),
        body: body.trim() || null,
      }),
    );
  }

  return (
    <li className="rounded-xl border border-tbb-line bg-white p-3.5 shadow-tbb-xs">
      <div className="flex items-start gap-3">
        {canEdit && (
          <div className="flex flex-col gap-0.5 pt-0.5">
            <button
              type="button"
              aria-label="Move up"
              disabled={busy || index === 0}
              onClick={() => onMove(index, -1)}
              className="text-tbb-ink-3 hover:text-tbb-blue disabled:opacity-25"
            >
              <ArrowUp className="w-3.5 h-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={busy || index === total - 1}
              onClick={() => onMove(index, 1)}
              className="text-tbb-ink-3 hover:text-tbb-blue disabled:opacity-25"
            >
              <ArrowDown className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1.5">
          {editing ? (
            <form onSubmit={saveEdit} className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={500}
                className="w-full rounded-lg border border-tbb-line px-2.5 py-1.5 font-sans text-sm font-bold text-tbb-navy focus:border-tbb-blue focus:outline-none"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="Context, links, what you want to decide…"
                className="w-full rounded-lg border border-tbb-line px-2.5 py-1.5 font-sans text-sm text-tbb-navy placeholder:text-tbb-ink-3 focus:border-tbb-blue focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-tbb-navy px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-white hover:bg-tbb-blue"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setTitle(item.title);
                    setBody(item.body ?? "");
                  }}
                  className="rounded-lg border border-tbb-line px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditing(true)}
                  className="text-left font-sans text-sm font-bold text-tbb-navy hover:underline underline-offset-4 disabled:no-underline disabled:cursor-default"
                >
                  {item.title}
                </button>
                <span
                  className={
                    "font-mono text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-0.5 rounded-pill " +
                    (STATUS_TONE[item.status] ?? STATUS_TONE.pending)
                  }
                >
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
                {item.carriedForward && (
                  <span
                    title="Carried forward from an earlier meeting"
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3"
                  >
                    <CornerDownRight className="w-3 h-3" aria-hidden />
                    Carried over
                  </span>
                )}
              </div>
              {item.body && (
                <p className="font-sans text-sm text-muted-foreground whitespace-pre-wrap">
                  {item.body}
                </p>
              )}
              {item.raisedByName && (
                <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
                  Raised by {item.raisedByName}
                </p>
              )}
            </>
          )}

          {item.actions.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-tbb-line pl-3">
              {item.actions.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/business-builder/action-items/${a.id}`}
                    className="group flex items-baseline gap-2 flex-wrap"
                  >
                    <Check
                      className={
                        "w-3 h-3 shrink-0 " +
                        (a.status === "done"
                          ? "text-tbb-success"
                          : "text-tbb-ink-3")
                      }
                      aria-hidden
                    />
                    <span
                      className={
                        "font-sans text-sm group-hover:underline underline-offset-4 " +
                        (a.status === "done"
                          ? "text-tbb-ink-3 line-through"
                          : "text-tbb-navy")
                      }
                    >
                      {a.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
                      {a.assigneeName ?? "Unassigned"}
                      {a.dueDate
                        ? ` · due ${a.dueDate.toLocaleDateString("en-CA")}`
                        : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {isTasking && (
            <TaskOffForm
              agendaItemId={item.id}
              sessionId={sessionId}
              engagementId={engagementId}
              defaultTitle={item.title}
              teammates={teammates}
              currentUserProfileId={currentUserProfileId}
              onDone={onToggleTasking}
              onRun={onRun}
            />
          )}
        </div>

        {canEdit && !editing && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleTasking}
              title="Task this to someone"
              className="rounded-lg border border-tbb-line px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors"
            >
              {isTasking ? <X className="w-3 h-3" aria-hidden /> : "Task it"}
            </button>
            <select
              value={item.status}
              disabled={busy}
              aria-label="Agenda item status"
              onChange={(e) =>
                onRun(() =>
                  setAgendaItemStatus(
                    item.id,
                    e.target.value as "pending" | "discussed" | "deferred",
                  ),
                )
              }
              className="rounded-lg border border-tbb-line bg-white px-1.5 py-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-navy focus:border-tbb-blue focus:outline-none"
            >
              <option value="pending">To discuss</option>
              <option value="discussed">Discussed</option>
              <option value="deferred">Carried</option>
            </select>
            <button
              type="button"
              title="Delete talking point"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    item.actions.length > 0
                      ? `Delete "${item.title}"? The ${item.actions.length} action item(s) tasked off it will stay — they'll just lose the link back to this point.`
                      : `Delete "${item.title}"?`,
                  )
                ) {
                  return;
                }
                onRun(() => deleteAgendaItem(item.id));
              }}
              className="text-tbb-ink-3 hover:text-tbb-orange disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Turn a talking point into a commitment. Defaults the title to the
 * point itself and the assignee to the OTHER person when the team is
 * exactly two — the common case for a Bruce/Jen touch-base is "you take
 * this one", so that's the default worth having.
 */
function TaskOffForm({
  agendaItemId,
  sessionId,
  engagementId,
  defaultTitle,
  teammates,
  currentUserProfileId,
  onDone,
  onRun,
}: {
  agendaItemId: string;
  sessionId: string;
  engagementId: string;
  defaultTitle: string;
  teammates: InternalTeammate[];
  currentUserProfileId: string;
  onDone: () => void;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const others = teammates.filter(
    (t) => t.userProfileId !== currentUserProfileId,
  );
  const [title, setTitle] = useState(defaultTitle);
  const [assignee, setAssignee] = useState(
    others.length === 1 ? others[0].userProfileId : currentUserProfileId,
  );
  const [dueDate, setDueDate] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onDone();
    onRun(() =>
      createActionItem({
        engagementId,
        title: trimmed,
        assigneeUserProfileId: assignee || null,
        dueDate: dueDate || null,
        agendaItemId,
        bbsSessionId: sessionId,
      }),
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 rounded-lg border border-tbb-blue/40 bg-tbb-blue/5 p-3 space-y-2"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={500}
        placeholder="What's the commitment?"
        className="w-full rounded-lg border border-tbb-line bg-white px-2.5 py-1.5 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
      />
      <div className="flex gap-2 flex-wrap">
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          aria-label="Assign to"
          className="rounded-lg border border-tbb-line bg-white px-2 py-1.5 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
        >
          {teammates.map((t) => (
            <option key={t.userProfileId} value={t.userProfileId}>
              {t.userProfileId === currentUserProfileId
                ? `${t.fullName} (me)`
                : t.fullName}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className="rounded-lg border border-tbb-line bg-white px-2 py-1.5 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-tbb-blue px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-white hover:bg-tbb-navy transition-colors"
        >
          Assign
        </button>
      </div>
    </form>
  );
}
