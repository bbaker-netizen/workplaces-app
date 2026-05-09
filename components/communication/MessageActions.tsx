"use client";

/**
 * MessageActions — inline edit + delete affordances, shown to the
 * author or a leadership-role moderator.
 *
 * Edit replaces the row body in place with a textarea (mirrors the
 * 1.2 "fast path inline" pattern for status pills). Delete uses native
 * `confirm()` — Phase 1.3 stays dependency-free for confirmations.
 */

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteMessage, updateMessage } from "@/lib/actions/messages";

export function MessageActions({
  messageId,
  initialBody,
  isAuthor,
}: {
  messageId: string;
  initialBody: string;
  isAuthor: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSaveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Message can't be empty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateMessage(messageId, { body: trimmed });
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
      const result = await deleteMessage(messageId);
      if (!result.ok) setError(result.error);
    });
  };

  if (editing) {
    return (
      <div
        className="absolute left-0 right-0 top-full mt-2 z-10 bg-white border border-[#CCCCCC] rounded-md p-3 shadow-md"
        // The trigger row is positioned relative; this drawer floats below.
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          disabled={isPending}
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057] focus:border-[#2E4057] disabled:opacity-60 resize-y"
        />
        {error && (
          <p
            role="alert"
            className="mt-2 font-sans text-sm text-[#E87722]"
          >
            {error}
          </p>
        )}
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setEditing(false);
              setDraft(initialBody);
              setError(null);
            }}
            className="font-sans text-xs uppercase tracking-[0.15em] px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || draft.trim() === initialBody.trim()}
            onClick={onSaveEdit}
            className="font-sans text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {isAuthor && (
        <button
          type="button"
          aria-label="Edit message"
          onClick={() => setEditing(true)}
          disabled={isPending}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[#F5F1E8]"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
      <button
        type="button"
        aria-label="Delete message"
        onClick={onDelete}
        disabled={isPending}
        className="p-1 rounded text-muted-foreground hover:text-[#E87722] hover:bg-[#F5F1E8]"
      >
        <Trash2 className="w-3.5 h-3.5" aria-hidden />
      </button>
      {error && (
        <span
          role="alert"
          className="font-sans text-xs text-[#E87722] ml-1"
        >
          {error}
        </span>
      )}
    </div>
  );
}
