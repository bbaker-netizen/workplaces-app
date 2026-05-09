"use client";

/**
 * MessageRow — single message in a thread.
 *
 * Client component. Owns the inline edit state so the textarea can
 * replace the message body in place when the author hits the pencil
 * icon. (The earlier draft kept edit state in a separate MessageActions
 * component and floated the textarea as an absolutely-positioned drawer
 * inside an opacity-0 hover wrapper — clicking the pencil hid the
 * drawer instantly because the cursor moved off the hover area. Inline
 * replacement avoids the whole class of bug.)
 *
 * Tombstoned messages render as a single muted "[Message deleted]" line
 * — the row stays in place so the conversation still flows past it
 * (WhatsApp-style; per Bruce 2026-05-09).
 */

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { isTombstone as messageIsTombstone } from "@/lib/communication/tombstone";
import { deleteMessage, updateMessage } from "@/lib/actions/messages";
import { formatMessageTimestamp } from "./utils";
import type { ListedMessage } from "@/lib/db/queries/messages";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function MessageRow({
  message,
  viewerUserProfileId,
  viewerCanModerate,
}: {
  message: ListedMessage;
  viewerUserProfileId: string;
  viewerCanModerate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isTombstone = messageIsTombstone(message);
  const isAuthor = message.authorUserProfileId === viewerUserProfileId;
  const canEdit = isAuthor && !isTombstone;
  const canDelete = (isAuthor || viewerCanModerate) && !isTombstone;
  const showActions = canEdit || canDelete;

  const startEdit = () => {
    setDraft(message.body);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(message.body);
    setError(null);
  };

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Message can't be empty.");
      return;
    }
    if (trimmed === message.body.trim()) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateMessage(message.id, { body: trimmed });
      if (!result.ok) {
        setError(result.error);
      } else {
        setEditing(false);
      }
    });
  };

  const onDelete = () => {
    const confirmed = window.confirm(
      "Delete this message? It will show as [Message deleted] to everyone in the thread.",
    );
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteMessage(message.id);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <li className="flex gap-3 sm:gap-4 group">
      <div
        aria-hidden
        className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-[#CCCCCC] bg-[#F5F1E8] grid place-items-center font-mono text-xs uppercase tracking-wider text-[#666666]"
      >
        {initialsOf(message.authorName) || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <header className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
          <span className="font-sans text-sm font-bold text-foreground">
            {message.authorName}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            {formatMessageTimestamp(message.createdAt)}
          </span>
          {message.editedAt && !isTombstone && (
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground italic">
              · edited
            </span>
          )}
          {showActions && !editing && (
            <span className="ml-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1">
              {canEdit && (
                <button
                  type="button"
                  aria-label="Edit message"
                  onClick={startEdit}
                  disabled={isPending}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#F5F1E8]"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  aria-label="Delete message"
                  onClick={onDelete}
                  disabled={isPending}
                  className="p-1 rounded text-muted-foreground hover:text-[#E87722] hover:bg-[#F5F1E8]"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </span>
          )}
        </header>
        <div className="mt-1">
          {isTombstone ? (
            <p className="font-sans text-sm italic text-muted-foreground">
              [Message deleted]
            </p>
          ) : editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    saveEdit();
                  }
                }}
                rows={3}
                autoFocus
                disabled={isPending}
                className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057] focus:border-[#2E4057] disabled:opacity-60 resize-y"
              />
              {error && (
                <p role="alert" className="font-sans text-sm text-[#E87722]">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  Esc to cancel · ⌘/Ctrl + Enter to save
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={cancelEdit}
                    className="font-sans text-xs uppercase tracking-[0.15em] px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      isPending ||
                      draft.trim().length === 0 ||
                      draft.trim() === message.body.trim()
                    }
                    onClick={saveEdit}
                    className="font-sans text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <MarkdownBody body={message.body} />
          )}
        </div>
        {!editing && error && (
          <p
            role="alert"
            className="mt-1 font-sans text-xs text-[#E87722]"
          >
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
