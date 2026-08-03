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
  const drafts = items.filter((i) => i.status === "draft");
  const live = items.filter((i) => i.status !== "draft");

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Needs your review
          </h2>
          {drafts.length > 0 && (
            <span className="font-mono text-[11px] text-tbb-blue font-bold">
              {drafts.length} waiting
            </span>
          )}
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
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Published from this session
        </h2>
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
}: {
  item: FollowThroughItem;
  members: Member[];
  isDraft?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(item.title);
  const [owner, setOwner] = useState(item.assigneeUserProfileId ?? "");
  const [due, setDue] = useState(toDateInput(item.dueDate));
  const [kind, setKind] = useState<string>(item.deliverableType ?? "");
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title !== item.title ||
    owner !== (item.assigneeUserProfileId ?? "") ||
    due !== toDateInput(item.dueDate) ||
    kind !== (item.deliverableType ?? "");

  const save = (extra?: { status?: (typeof STATUSES)[number] | "open" }) => {
    setError(null);
    startTransition(async () => {
      const r = await updateActionItem(item.id, {
        title,
        assigneeUserProfileId: owner === "" ? null : owner,
        dueDate: due === "" ? null : due,
        deliverableType: kind === "" ? null : (kind as DeliverableType),
        ...(extra?.status ? { status: extra.status } : {}),
      });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  const remove = () => {
    if (!confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteActionItem(item.id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  return (
    <li
      className={
        "rounded-md border bg-white px-3 py-2.5 space-y-2 " +
        (isDraft ? "border-tbb-blue/50 bg-tbb-cream-50/40" : "border-tbb-line")
      }
    >
      <div className="flex items-start gap-2">
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
              startTransition(async () => {
                const r = await updateActionItem(item.id, {
                  status: e.target.value as (typeof STATUSES)[number],
                });
                if (!r.ok) setError(r.error);
                else router.refresh();
              })
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
            {isPending ? (
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
              {isPending ? (
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
          <Trash2 className="w-3.5 h-3.5" aria-hidden />
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
