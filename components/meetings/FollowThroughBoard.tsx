"use client";

/**
 * FollowThroughBoard — the one list that comes out of a session.
 *
 * Everything the transcript produced, plus anything it missed, in one
 * place: edit the wording, set an owner (us or the client), set a date,
 * say whether it is an ordinary commitment or one of the nine
 * documents, and publish. Before this the same work was split across
 * the Meetings library, Action items, Deliverables and the BBS session
 * page.
 *
 * Drafts are the reason the page exists, so they are visually separated
 * and carry the publish control. Nothing a client can see changes until
 * Publish is pressed — `draft` is the status the portal filters out for
 * every client role.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  createActionItem,
  updateActionItem,
  deleteActionItem,
} from "@/lib/actions/action-items";
import {
  DELIVERABLE_TYPES,
  DELIVERABLE_TYPE_LABEL,
  isDraftingPlaceholder,
  type DeliverableType,
} from "@/lib/deliverables/types";
import type { FollowThroughItem } from "@/lib/db/queries/meeting-workspace";

type Member = { id: string; name: string | null; role: string };

const STATUSES = ["open", "in_progress", "done", "blocked"] as const;

function toDateInput(d: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export function FollowThroughBoard({
  engagementId,
  meetingId,
  items,
  members,
}: {
  engagementId: string;
  meetingId: string;
  items: FollowThroughItem[];
  members: Member[];
}) {
  const router = useRouter();
  const drafts = items.filter((i) => i.status === "draft");
  const live = items.filter((i) => i.status !== "draft");

  /**
   * Bulk selection, for clearing a drafting run you don't want.
   *
   * A pass over a long transcript can produce twenty drafts, and binning
   * them one confirm at a time is twenty dialogs. Selection is held here
   * rather than per-row so the count and the action live together.
   *
   * Ids are pruned against the current list on every render pass, so a
   * selected item that has since been deleted or published elsewhere
   * cannot linger in the set and inflate the count.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const liveIds = new Set(items.map((i) => i.id));
  const chosen = Array.from(selected).filter((id) => liveIds.has(id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const deleteSelected = () => {
    if (chosen.length === 0) return;
    const publishedCount = chosen.filter(
      (id) => items.find((i) => i.id === id)?.status !== "draft",
    ).length;
    // The published count is stated separately. Binning drafts is
    // housekeeping; binning something the client can already see is a
    // different act, and the confirm should not let the two blur.
    const warning =
      publishedCount > 0
        ? `\n\n${publishedCount} of them ${publishedCount === 1 ? "is" : "are"} already published and visible to the client.`
        : "";
    if (
      !confirm(
        `Delete ${chosen.length} item${chosen.length === 1 ? "" : "s"}? This can't be undone.${warning}`,
      )
    ) {
      return;
    }
    setBulkError(null);
    setBulkBusy(true);
    void (async () => {
      try {
        // Sequential, not Promise.all. Each delete is its own
        // authorization pass and transaction, and firing twenty at once
        // at a serverless database is how you exhaust the pool for
        // everything else on the page.
        const failures: string[] = [];
        for (const id of chosen) {
          const r = await deleteActionItem(id);
          if (!r.ok) failures.push(r.error);
        }
        setSelected(new Set());
        // Report the count, not just the first failure: a partial result
        // silently reported as success is how you think something is gone
        // when it is not.
        if (failures.length > 0) {
          setBulkError(
            `${failures.length} of ${chosen.length} could not be deleted. ${failures[0]}`,
          );
        }
        router.refresh();
      } finally {
        setBulkBusy(false);
      }
    })();
  };

  return (
    <div className="space-y-5">
      {chosen.length > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-3 flex-wrap rounded-md border border-tbb-blue/50 bg-tbb-cream-50 px-3 py-2 shadow-tbb-xs">
          <span className="text-[11px] font-bold text-tbb-navy">
            {chosen.length} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy}
            className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy disabled:opacity-50"
          >
            Clear
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={deleteSelected}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1.5 rounded-pill border border-tbb-danger px-3 py-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-danger hover:bg-tbb-danger hover:text-white disabled:opacity-50 transition-colors"
          >
            {bulkBusy ? (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="w-3 h-3" aria-hidden />
            )}
            Delete selected
          </button>
        </div>
      )}
      {bulkError && (
        <p role="alert" className="text-[11px] text-tbb-danger">
          {bulkError}
        </p>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Needs your review
          </h2>
          <div className="flex items-baseline gap-3">
            {drafts.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  toggleAll(
                    drafts.map((d) => d.id),
                    !drafts.every((d) => selected.has(d.id)),
                  )
                }
                className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue"
              >
                {drafts.every((d) => selected.has(d.id))
                  ? "Deselect all"
                  : "Select all"}
              </button>
            )}
            {drafts.length > 0 && (
              <span className="font-mono text-[11px] text-tbb-blue font-bold">
                {drafts.length} waiting
              </span>
            )}
          </div>
        </div>
        {drafts.length === 0 ? (
          <p className="text-xs text-tbb-ink-3 italic border border-dashed border-tbb-line rounded-md px-3 py-3">
            Nothing waiting. Anything drafted from the transcript lands here
            first — the client never sees it until you publish.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {drafts.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                members={members}
                isDraft
                selected={selected.has(item.id)}
                onToggleSelected={() => toggle(item.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Published from this session
          </h2>
          {live.length > 0 && (
            <button
              type="button"
              onClick={() =>
                toggleAll(
                  live.map((l) => l.id),
                  !live.every((l) => selected.has(l.id)),
                )
              }
              className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue"
            >
              {live.every((l) => selected.has(l.id))
                ? "Deselect all"
                : "Select all"}
            </button>
          )}
        </div>
        {live.length === 0 ? (
          <p className="text-xs text-tbb-ink-3 italic">
            Nothing published from this session yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {live.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                members={members}
                selected={selected.has(item.id)}
                onToggleSelected={() => toggle(item.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <AddItem
        engagementId={engagementId}
        meetingId={meetingId}
        members={members}
      />
    </div>
  );
}

function ItemRow({
  item,
  members,
  isDraft,
  selected = false,
  onToggleSelected,
}: {
  item: FollowThroughItem;
  members: Member[];
  isDraft?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(item.title);
  const [owner, setOwner] = useState(item.assigneeUserProfileId ?? "");
  const [due, setDue] = useState(toDateInput(item.dueDate));
  const [kind, setKind] = useState<string>(item.deliverableType ?? "");
  const [error, setError] = useState<string | null>(null);

  /**
   * The body of the item — the plan, not just its name.
   *
   * The row edited title, owner, date and type but never the
   * description, so the substance of anything Claude drafted was
   * read-only on the one page built for reviewing it. For a plain to-do
   * that is survivable; for a drafted document it means the entire
   * artefact could be published or binned but not corrected. Collapsed
   * by default so the list still scans, opened automatically when there
   * is already a body worth seeing.
   */
  const [body, setBody] = useState(item.description ?? "");
  const [showBody, setShowBody] = useState(false);

  /**
   * WHICH action is running, not merely whether one is.
   *
   * Every button in this row shared a single `isPending`, so pressing
   * Delete swapped the PUBLISH button's tick for a spinner — the one
   * control on this page that puts something in front of a client. It
   * read as "publishing now" at the exact moment you had asked to throw
   * the item away. Bruce reported it as that, and he was right to.
   *
   * Everything still disables together while any write is in flight —
   * concurrent mutations on one row are not wanted. Only the spinner is
   * narrowed, so the feedback lands on the button you actually pressed.
   */
  const [busy, setBusy] = useState<
    null | "save" | "publish" | "delete" | "status"
  >(null);

  const run = (
    kindOfWork: "save" | "publish" | "delete" | "status",
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ) => {
    setError(null);
    setBusy(kindOfWork);
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) setError(r.error ?? "Something went wrong.");
        else router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const dirty =
    title !== item.title ||
    body !== (item.description ?? "") ||
    owner !== (item.assigneeUserProfileId ?? "") ||
    due !== toDateInput(item.dueDate) ||
    kind !== (item.deliverableType ?? "");

  const save = (extra?: { status?: (typeof STATUSES)[number] | "open" }) => {
    run(extra?.status === "open" ? "publish" : "save", () =>
      updateActionItem(item.id, {
        title,
        description: body,
        assigneeUserProfileId: owner === "" ? null : owner,
        dueDate: due === "" ? null : due,
        deliverableType: kind === "" ? null : (kind as DeliverableType),
        ...(extra?.status ? { status: extra.status } : {}),
      }),
    );
  };

  const remove = () => {
    if (!confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    run("delete", () => deleteActionItem(item.id));
  };

  // Keyed off the row's stored body rather than a status, because the
  // background writer's only signal that it has finished IS replacing
  // that body. Compared against the shared sentinel so the writer and
  // this reader cannot drift.
  const drafting = isDraftingPlaceholder(item.description);

  // A document whose background draft hasn't landed yet. Rendered as a
  // job in flight, not as something to review: it has no content to
  // read, and an owner picker, a due date and a Publish button over a
  // progress note invite you to publish the sentence "the drafting job
  // didn't run — tell Bruce" to a client.
  if (drafting) {
    return (
      <li className="rounded-md border border-dashed border-tbb-blue/50 bg-tbb-cream-50/40 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Loader2
            className="w-3.5 h-3.5 text-tbb-blue animate-spin shrink-0 mt-0.5"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[14px] text-tbb-navy truncate">
              {item.title}
            </p>
            <p className="mt-0.5 text-[11px] text-tbb-ink-3">
              Writing this document from the transcript — a few minutes.
              It will appear here on its own; nothing to do until then.
            </p>
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            title="Cancel this document"
            className="shrink-0 text-tbb-ink-3 hover:text-tbb-danger disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={
        "rounded-md border bg-white px-3 py-2.5 space-y-2 " +
        (isDraft ? "border-tbb-blue/50 bg-tbb-cream-50/40" : "border-tbb-line")
      }
    >
      <div className="flex items-start gap-2">
        {onToggleSelected && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select "${item.title}"`}
            className="mt-1.5 shrink-0 accent-tbb-blue"
          />
        )}
        {item.createdBy === "claude" && (
          <span
            title={
              item.confidenceFlag
                ? `Drafted by Claude · ${item.confidenceFlag} confidence`
                : "Drafted by Claude"
            }
            className="shrink-0 mt-1.5"
          >
            <Sparkles className="w-3 h-3 text-tbb-blue" aria-hidden />
          </span>
        )}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
          aria-label="Title"
          className="flex-1 min-w-0 font-bold text-[14px] text-tbb-navy bg-transparent border-b border-transparent hover:border-tbb-line focus:border-tbb-blue focus:outline-none py-0.5"
        />
        {!isDraft && (
          <Link
            href={`/business-builder/action-items/${item.id}`}
            className="shrink-0 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue mt-1"
          >
            Open
          </Link>
        )}
      </div>

      {/* The plan itself. Kept behind a toggle so a list of twenty items
          still scans, but one press away rather than on another page —
          this is the screen where a draft is decided on, and deciding
          means reading what it actually says. */}
      {showBody || body ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={isPending}
          rows={body.length > 400 ? 10 : 4}
          aria-label="Details"
          placeholder="The detail — what this involves, what done looks like, anything the client needs to know."
          className="w-full rounded-sm border border-tbb-line bg-white px-2 py-1.5 text-[12px] leading-relaxed text-tbb-navy placeholder:text-tbb-ink-3 focus:border-tbb-blue focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowBody(true)}
          className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue"
        >
          + Add detail
        </button>
      )}

      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          disabled={isPending}
          aria-label="Owner"
          className="rounded-sm border border-tbb-line bg-white px-1.5 py-1 text-tbb-navy max-w-[11rem]"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? "Unnamed"}
              {m.role === "coach" || m.role === "master_admin" ? " (us)" : ""}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          disabled={isPending}
          aria-label="Due date"
          className="rounded-sm border border-tbb-line bg-white px-1.5 py-1 text-tbb-navy"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          disabled={isPending}
          aria-label="Type"
          className="rounded-sm border border-tbb-line bg-white px-1.5 py-1 text-tbb-navy max-w-[12rem]"
        >
          <option value="">To-do</option>
          {DELIVERABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DELIVERABLE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>

        {!isDraft && (
          <select
            value={item.status}
            onChange={(e) =>
              run("status", () =>
                updateActionItem(item.id, {
                  status: e.target.value as (typeof STATUSES)[number],
                }),
              )
            }
            disabled={isPending}
            aria-label="Status"
            className="rounded-sm border border-tbb-line bg-white px-1.5 py-1 text-tbb-navy"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        )}

        <span className="flex-1" />

        {isDraft ? (
          <button
            type="button"
            onClick={() => save({ status: "open" })}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-pill bg-tbb-blue text-white font-bold uppercase tracking-tbb-caps px-2.5 py-1 hover:bg-tbb-blue-700 disabled:opacity-50"
          >
            {busy === "publish" ? (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            ) : (
              <Check className="w-3 h-3" aria-hidden />
            )}
            Publish
          </button>
        ) : (
          dirty && (
            <button
              type="button"
              onClick={() => save()}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-pill border border-tbb-blue text-tbb-navy font-bold uppercase tracking-tbb-caps px-2.5 py-1 hover:bg-tbb-cream-50 disabled:opacity-50"
            >
              {busy === "save" ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
              ) : (
                <Check className="w-3 h-3" aria-hidden />
              )}
              Save
            </button>
          )
        )}
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          aria-label="Delete"
          className="text-tbb-ink-3 hover:text-tbb-danger disabled:opacity-50 p-1"
        >
          {busy === "delete" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
          )}
        </button>
      </div>

      {isDraft && dirty && (
        <p className="text-[10px] text-tbb-ink-3">
          Publishing saves your edits at the same time.
        </p>
      )}
      {error && <p className="text-[11px] text-tbb-danger">{error}</p>}
    </li>
  );
}

/**
 * The manual add. Bruce's explicit ask: the transcript will miss things,
 * and adding what it missed must not mean leaving the page and finding
 * a different module.
 *
 * Created straight to `open`, not `draft` — you wrote it, so there is
 * nothing to review.
 */
function AddItem({
  engagementId,
  meetingId,
  members,
}: {
  engagementId: string;
  meetingId: string;
  members: Member[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createActionItem({
        engagementId,
        title: title.trim(),
        status: "open",
        assigneeUserProfileId: owner === "" ? null : owner,
        dueDate: due === "" ? null : due,
        deliverableType: kind === "" ? null : (kind as DeliverableType),
        engagementMeetingId: meetingId,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTitle("");
      setOwner("");
      setDue("");
      setKind("");
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-navy border border-tbb-blue rounded-pill px-3 py-1.5 hover:bg-tbb-cream-50"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden />
        Add something the transcript missed
      </button>
    );
  }

  return (
    <div className="rounded-md border border-tbb-blue bg-white px-3 py-3 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs to happen?"
        disabled={isPending}
        className="w-full font-bold text-[14px] text-tbb-navy border-b border-tbb-line focus:border-tbb-blue focus:outline-none py-1"
      />
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          disabled={isPending}
          aria-label="Owner"
          className="rounded-sm border border-tbb-line bg-white px-1.5 py-1 max-w-[11rem]"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? "Unnamed"}
              {m.role === "coach" || m.role === "master_admin" ? " (us)" : ""}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          disabled={isPending}
          aria-label="Due date"
          className="rounded-sm border border-tbb-line bg-white px-1.5 py-1"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          disabled={isPending}
          aria-label="Type"
          className="rounded-sm border border-tbb-line bg-white px-1.5 py-1 max-w-[12rem]"
        >
          <option value="">To-do</option>
          {DELIVERABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DELIVERABLE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="text-tbb-ink-3 hover:text-tbb-navy px-2 py-1 uppercase tracking-tbb-caps font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-pill bg-tbb-blue text-white font-bold uppercase tracking-tbb-caps px-3 py-1 hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
          ) : (
            <FileText className="w-3 h-3" aria-hidden />
          )}
          Add
        </button>
      </div>
      {error && <p className="text-[11px] text-tbb-danger">{error}</p>}
    </div>
  );
}
