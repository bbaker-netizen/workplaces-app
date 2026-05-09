"use client";

/**
 * SoulFileEditor — view + edit the engagement's Soul File.
 *
 * Read-only render uses MarkdownBody. Edit mode swaps in a plain
 * textarea (large body, scroll-to-edit). Tiptap is overkill for
 * long-form notes — the writer's flow is markdown-fluent here.
 *
 * Save persists via `upsertSoulFileBody`; on success the page
 * revalidates server-side.
 */

import { useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import { upsertSoulFileBody } from "@/lib/actions/soul-files";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

const STARTER_TEMPLATE = `# Soul File

## Why this engagement exists


## Where the business is today


## Where they want to be in 12 months


## Strategic backdrop (industry, competitive, regulatory)


## Founders / leadership context


## Hard-won learnings & sensitivities

`;

export function SoulFileEditor({
  engagementId,
  initialBody,
  initialUpdatedAt,
  initialLastEditorName,
  canEdit,
}: {
  engagementId: string;
  initialBody: string;
  initialUpdatedAt: Date | null;
  initialLastEditorName: string | null;
  canEdit: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(initialUpdatedAt);
  const [lastEditor, setLastEditor] = useState<string | null>(
    initialLastEditorName,
  );
  const [isPending, startTransition] = useTransition();

  const startEdit = () => {
    setDraft(body || STARTER_TEMPLATE);
    setError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setError(null);
    setDraft(body);
  };
  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await upsertSoulFileBody({
        engagementId,
        body: draft,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setBody(draft);
        setUpdatedAt(new Date());
        setLastEditor("You");
        setEditing(false);
      }
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-display font-bold text-foreground text-xl tracking-tight">
          Soul File
        </h2>
        {!editing && canEdit && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057]"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden />
            {body.trim().length > 0 ? "Edit" : "Start writing"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isPending}
            rows={28}
            autoFocus
            className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057] resize-y leading-relaxed"
            placeholder={STARTER_TEMPLATE}
          />
          {error && (
            <p
              role="alert"
              className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Markdown supported · headings, lists, links
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="font-sans text-xs uppercase tracking-[0.15em] px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50"
              >
                {isPending && (
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                )}
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : body.trim().length === 0 ? (
        <div className="border border-[#CCCCCC] rounded-md bg-white p-6 space-y-2">
          <p className="font-display font-bold text-foreground text-base tracking-tight">
            Nothing here yet
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            {canEdit
              ? "Capture the deep context for this engagement: why it exists, where it's going, and what shapes the work. The Start writing button gives you a template to fill in."
              : "Your coach will populate this with the engagement context when they're ready."}
          </p>
        </div>
      ) : (
        <div className="border border-[#CCCCCC] rounded-md bg-white p-6">
          <MarkdownBody body={body} />
          {(updatedAt || lastEditor) && (
            <p className="mt-6 pt-3 border-t border-[#CCCCCC] font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Last edited
              {updatedAt && (
                <> {updatedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</>
              )}
              {lastEditor && <> by {lastEditor}</>}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
