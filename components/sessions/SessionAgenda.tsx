"use client";

/**
 * The agenda for one CLIENT session — the same board on both sides of
 * the glass.
 *
 * This is the surface that lets a client say "here is what I want to
 * cover next time" instead of remembering it on the drive over, and the
 * surface where the Business Builder sees it before they walk in. One
 * component renders both, with capabilities passed in, so the two views
 * cannot drift into disagreeing about what is on the agenda.
 *
 * **Why not `components/team/AgendaBoard`.** That board is the internal
 * touch-base: it links commitments into `/business-builder/...`, takes
 * an `InternalTeammate[]`, and defaults the assignee to "the other
 * person", all of which are wrong when one side is a client. The two
 * share the server actions and the read query — the parts where drift
 * would actually cost something — and diverge only in chrome.
 *
 * The permission split mirrors `lib/actions/agenda-items.ts`, which is
 * the authority; nothing here is a security boundary. Anyone in the
 * engagement may raise a point and retract their own. Reordering,
 * setting a status and carrying items forward are leadership-only,
 * because each of those rewrites an agenda other people are working
 * from.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  Loader2,
  MessageSquarePlus,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  carryForwardAgenda,
  createAgendaItem,
  deleteAgendaItem,
  reorderAgendaItems,
  setAgendaItemStatus,
  updateAgendaItem,
} from "@/lib/actions/agenda-items";
import type { ListedAgendaItem } from "@/lib/db/queries/agenda-items";

type Props = {
  sessionId: string;
  items: ListedAgendaItem[];
  currentUserProfileId: string;
  /** Raise a point / edit / retract your own. False on a past or
   *  cancelled session, and on a paused engagement. */
  canContribute: boolean;
  /** Reorder, set statuses, carry forward. Leadership only. */
  canManage: boolean;
  /** Client portal wording vs. Business Builder console wording. The
   *  same list reads very differently depending on which chair you are
   *  in: one side is asking, the other is preparing. */
  audience: "client" | "builder";
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

export function SessionAgenda({
  sessionId,
  items,
  currentUserProfileId,
  canContribute,
  canManage,
  audience,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const clientCount = items.filter((i) => i.raisedByClient).length;
  const isClient = audience === "client";

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
    const t = title.trim();
    if (!t) return;
    const b = body.trim();
    setTitle("");
    setBody("");
    setExpanded(false);
    run(() =>
      createAgendaItem({
        bbsSessionId: sessionId,
        title: t,
        body: b || null,
      }),
    );
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
        <div>
          <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
            Agenda
            {pendingCount > 0 && (
              <span className="ml-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                {pendingCount} to discuss
              </span>
            )}
          </h2>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            {isClient
              ? "Anything you want covered in this session — add it here and it goes straight on the agenda. Your Business Builder is notified so they can come prepared."
              : clientCount > 0
                ? `${clientCount} point${clientCount === 1 ? "" : "s"} raised by the client. Reorder, edit or remove anything here.`
                : "What this session is for. Anyone in the engagement can add a point — the client's own requests show up here too."}
          </p>
        </div>
        {canManage && pendingCount > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => carryForwardAgenda(sessionId))}
            className="font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline underline-offset-4 disabled:opacity-50"
          >
            Carry unfinished items to next session
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
          {isClient
            ? "Nothing on the agenda yet. If there's something on your mind, put it down below — it doesn't have to be polished."
            : "Nothing on the agenda yet."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, index) => (
            <AgendaRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              busy={pending}
              canManage={canManage}
              canEditThis={
                canContribute &&
                (canManage || item.raisedByUserProfileId === currentUserProfileId)
              }
              isMine={item.raisedByUserProfileId === currentUserProfileId}
              audience={audience}
              onMove={move}
              onRun={run}
            />
          ))}
        </ul>
      )}

      {canContribute && (
        <form
          onSubmit={add}
          className="rounded-xl border border-tbb-line bg-white p-3.5 shadow-tbb-xs space-y-2"
        >
          <label
            htmlFor={`agenda-title-${sessionId}`}
            className="block font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3"
          >
            {isClient ? "Add something to this agenda" : "Add a talking point"}
          </label>
          <input
            id={`agenda-title-${sessionId}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder={
              isClient
                ? "What do you want to talk about?"
                : "Add a talking point…"
            }
            maxLength={500}
            className="w-full rounded-lg border border-tbb-line bg-white px-3 py-2 font-sans text-sm text-tbb-navy placeholder:text-tbb-ink-3 focus:border-tbb-blue focus:outline-none focus:ring-1 focus:ring-tbb-blue"
          />
          {(expanded || body) && (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={
                isClient
                  ? "Any background that would help — numbers, names, what you're weighing up. Optional."
                  : "Context, links, what you want to decide. Optional."
              }
              className="w-full rounded-lg border border-tbb-line bg-white px-3 py-2 font-sans text-sm text-tbb-navy placeholder:text-tbb-ink-3 focus:border-tbb-blue focus:outline-none focus:ring-1 focus:ring-tbb-blue"
            />
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="submit"
              disabled={pending || title.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tbb-navy px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-white hover:bg-tbb-blue disabled:opacity-50 transition-colors"
            >
              {pending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden />
              )}
              {isClient ? "Add to agenda" : "Add"}
            </button>
            {isClient && (
              <span className="font-sans text-xs text-muted-foreground">
                Goes on the agenda straight away.
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function AgendaRow({
  item,
  index,
  total,
  busy,
  canManage,
  canEditThis,
  isMine,
  audience,
  onMove,
  onRun,
}: {
  item: ListedAgendaItem;
  index: number;
  total: number;
  busy: boolean;
  canManage: boolean;
  canEditThis: boolean;
  isMine: boolean;
  audience: "client" | "builder";
  onMove: (index: number, direction: -1 | 1) => void;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body ?? "");

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setEditing(false);
    onRun(() => updateAgendaItem(item.id, { title: t, body: body.trim() || null }));
  }

  // The client-raised badge is for the Business Builder's benefit — it is
  // the whole signal on that side of the glass. In the client's own
  // portal every point they raised is obviously theirs, so it would be
  // noise; they get "Added by you" instead.
  const showClientBadge = audience === "builder" && item.raisedByClient;

  return (
    <li
      className={
        "rounded-xl border bg-white p-3.5 shadow-tbb-xs " +
        (showClientBadge ? "border-tbb-blue/40" : "border-tbb-line")
      }
    >
      <div className="flex items-start gap-3">
        {canManage && (
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
                className="w-full rounded-lg border border-tbb-line px-2.5 py-1.5 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
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
                  disabled={!canEditThis}
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
                {showClientBadge && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-0.5 rounded-pill bg-tbb-blue/10 text-tbb-blue">
                    <UserRound className="w-3 h-3" aria-hidden />
                    Client raised
                  </span>
                )}
                {item.carriedForward && (
                  <span
                    title="Carried forward from an earlier session"
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
              {(item.raisedByName || isMine) && (
                <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
                  {isMine ? "Added by you" : `Raised by ${item.raisedByName}`}
                </p>
              )}
            </>
          )}

          {item.actions.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-tbb-line pl-3">
              {item.actions.map((a) => (
                <li
                  key={a.id}
                  className="flex items-baseline gap-2 flex-wrap font-sans text-sm"
                >
                  <span
                    className={
                      a.status === "done"
                        ? "text-tbb-ink-3 line-through"
                        : "text-tbb-navy"
                    }
                  >
                    {a.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
                    {a.assigneeName ?? "Unassigned"}
                    {a.dueDate
                      ? ` · due ${new Date(a.dueDate).toLocaleDateString("en-CA")}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!editing && (canManage || canEditThis) && (
          <div className="flex shrink-0 items-center gap-1">
            {canManage && (
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
            )}
            {canEditThis && (
              <button
                type="button"
                title="Remove this point"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Remove "${item.title}" from the agenda?`)) {
                    return;
                  }
                  onRun(() => deleteAgendaItem(item.id));
                }}
                className="text-tbb-ink-3 hover:text-tbb-orange disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
