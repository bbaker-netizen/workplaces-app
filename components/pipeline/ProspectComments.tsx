"use client";

/**
 * Internal Business Builder discussion on a prospect / client.
 *
 * A private comment thread — visible to Business Builders only, never to
 * the client. Post a comment and optionally @notify one or more
 * teammates, who get an email + an in-app notification. Distinct from
 * the Activity log (a factual touchpoint record) — this is where Bruce,
 * Jen, and the team actually talk about a lead.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Send, Trash2, Users } from "lucide-react";
import {
  createProspectComment,
  deleteProspectComment,
} from "@/lib/actions/prospect-comments";
import type { ProspectCommentWithAuthor } from "@/lib/db/queries/prospect-comments";

export type Teammate = { id: string; fullName: string };

export function ProspectComments({
  prospectId,
  comments,
  teammates,
  currentUserId,
  isMasterAdmin,
  embedded = false,
}: {
  prospectId: string;
  comments: ProspectCommentWithAuthor[];
  /** Other Business Builders who can be notified (excludes the viewer). */
  teammates: Teammate[];
  currentUserId: string;
  isMasterAdmin: boolean;
  /** When rendered inside a CollapsibleSection, drop the card chrome +
   *  title (the drawer supplies them). */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleNotify(id: string) {
    setNotify((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!body.trim()) {
      setError("Write a comment first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createProspectComment({
        prospectId,
        body: body.trim(),
        notifyIds: Array.from(notify),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBody("");
      setNotify(new Set());
      router.refresh();
    });
  }

  const Wrapper = embedded ? "div" : "section";

  return (
    <Wrapper
      className={
        embedded
          ? ""
          : "border border-tbb-line rounded-lg bg-white shadow-tbb-sm"
      }
    >
      {!embedded && (
        <header className="px-5 py-3 border-b border-tbb-line-soft flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            <MessageCircle className="w-3.5 h-3.5" aria-hidden />
            Team discussion
          </h2>
          <span className="text-[11px] text-tbb-ink-3 tabular-nums">
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
          </span>
        </header>
      )}

      <p className="px-5 pt-3 text-[11px] text-tbb-ink-3">
        Private to Business Builders — the client never sees this. Use it to
        talk through a lead with the team.
      </p>

      {/* Thread */}
      <ul className="px-5 py-4 space-y-4 max-h-[500px] overflow-y-auto">
        {comments.length === 0 ? (
          <li className="text-sm text-tbb-ink-4 italic">
            No comments yet — start the conversation.
          </li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="flex gap-3 group">
              <span className="w-7 h-7 flex-none rounded-pill bg-tbb-blue-100 text-tbb-blue grid place-items-center text-[11px] font-bold uppercase">
                {initials(c.authorName)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-bold text-tbb-navy">
                    {c.authorName ?? "Unknown"}
                  </span>
                  <span className="text-[10px] text-tbb-ink-3 tabular-nums">
                    {new Date(c.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {(c.authorUserProfileId === currentUserId ||
                    isMasterAdmin) && (
                    <DeleteButton
                      commentId={c.id}
                      onDone={() => router.refresh()}
                    />
                  )}
                </div>
                <p className="text-sm text-tbb-ink-2 mt-0.5 whitespace-pre-wrap break-words">
                  {c.body}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>

      {/* Composer */}
      <div className="px-5 py-4 border-t border-tbb-line-soft space-y-2">
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={isPending}
          spellCheck
          placeholder="Add a comment for the team…"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
        />

        {teammates.length > 0 && (
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              <Users className="w-3 h-3" aria-hidden /> Notify
            </span>
            <div className="flex flex-wrap gap-1.5">
              {teammates.map((t) => {
                const on = notify.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleNotify(t.id)}
                    aria-pressed={on}
                    className={
                      "px-2.5 py-1 rounded-pill text-[11px] font-bold transition-colors duration-tbb-base " +
                      (on
                        ? "bg-tbb-blue text-white"
                        : "bg-white border border-tbb-line text-tbb-ink-2 hover:border-tbb-blue")
                    }
                  >
                    {t.fullName}
                  </button>
                );
              })}
            </div>
            {notify.size > 0 && (
              <p className="text-[11px] text-tbb-ink-3">
                {notify.size} teammate{notify.size === 1 ? "" : "s"} will get an
                email + a notification.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-tbb-danger">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
          ) : (
            <Send className="w-3 h-3" aria-hidden />
          )}
          Post comment
        </button>
      </div>
    </Wrapper>
  );
}

function DeleteButton({
  commentId,
  onDone,
}: {
  commentId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        if (!window.confirm("Delete this comment?")) return;
        startTransition(async () => {
          const r = await deleteProspectComment({ id: commentId });
          if (r.ok) onDone();
          else window.alert(r.error);
        });
      }}
      disabled={isPending}
      aria-label="Delete comment"
      className="ml-auto inline-flex items-center text-tbb-ink-4 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-tbb-danger disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="w-3 h-3" aria-hidden />
      )}
    </button>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")
  ).toUpperCase();
}
