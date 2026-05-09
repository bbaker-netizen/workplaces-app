"use client";

/**
 * MessageComposer — client component, posts a new message via the
 * createMessage server action.
 *
 * Plain `<textarea>` for Phase 1.3 — no rich-text toolbar yet. The
 * "Markdown supported" hint sets expectation; the renderer handles
 * `**bold**`, `*italics*`, lists, links, and `> quotes`.
 *
 * Submit on Cmd/Ctrl+Enter mirrors what most messaging apps do; plain
 * Enter just inserts a newline so multi-line drafts don't fire early.
 */

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createMessage } from "@/lib/actions/messages";

export function MessageComposer({
  engagementId,
  parentEntityType,
  parentEntityId,
  placeholder,
}: {
  engagementId: string;
  parentEntityType: string;
  parentEntityId: string;
  placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await createMessage({
        engagementId,
        parentEntityType,
        parentEntityId,
        body: trimmed,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setBody("");
      }
    });
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={
        "space-y-2 transition-opacity " + (isPending ? "opacity-60" : "")
      }
      aria-busy={isPending}
    >
      <label className="block relative">
        <span className="sr-only">Write a message</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder={placeholder ?? "Write a message…"}
          disabled={isPending}
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057] focus:border-[#2E4057] disabled:bg-[#F5F1E8] disabled:cursor-wait resize-y"
        />
        {isPending && (
          <span
            aria-hidden
            className="absolute right-3 top-3 text-[#2E4057]"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
          </span>
        )}
      </label>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span
          className={
            "font-mono text-[11px] uppercase tracking-[0.15em] " +
            (isPending ? "text-[#2E4057] font-bold" : "text-muted-foreground")
          }
        >
          {isPending
            ? "Posting your message…"
            : "Markdown supported · ⌘/Ctrl + Enter to send"}
        </span>
        <button
          type="submit"
          disabled={isPending || body.trim().length === 0}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {isPending && (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          )}
          {isPending ? "Posting…" : "Post"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}
    </form>
  );
}
