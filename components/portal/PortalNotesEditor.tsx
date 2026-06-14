"use client";

/**
 * Private notes editor for the client portal. A simple markdown
 * scratchpad: type, hit Save (or it saves on blur). Only the owner ever
 * sees it. Stays editable even when the engagement is read-only.
 */

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { upsertPortalNote } from "@/lib/actions/portal-notes";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

export function PortalNotesEditor({
  engagementId,
  initialBody,
}: {
  engagementId: string;
  initialBody: string;
}) {
  const [body, setBody] = useState(initialBody);
  const [saved, setSaved] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = body !== saved;

  function save() {
    if (!dirty || isPending) return;
    setError(null);
    const snapshot = body;
    startTransition(async () => {
      const r = await upsertPortalNote({ engagementId, body: snapshot });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(snapshot);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className={
              "font-bold uppercase tracking-tbb-caps " +
              (!showPreview ? "text-tbb-navy" : "text-tbb-ink-3 hover:text-tbb-navy")
            }
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className={
              "font-bold uppercase tracking-tbb-caps " +
              (showPreview ? "text-tbb-navy" : "text-tbb-ink-3 hover:text-tbb-navy")
            }
          >
            Preview
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {isPending ? (
            <span className="inline-flex items-center gap-1 text-tbb-ink-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Saving…
            </span>
          ) : dirty ? (
            <span className="text-tbb-ink-3">Unsaved changes</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-tbb-success">
              <Check className="w-3.5 h-3.5" aria-hidden /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || isPending}
            className="font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="min-h-[300px] rounded-md border border-tbb-line bg-white p-4">
          {body.trim() ? (
            <MarkdownBody body={body} />
          ) : (
            <p className="text-sm text-tbb-ink-4 italic">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={save}
          placeholder="Jot anything down — questions for your next session, ideas, reminders. Markdown works. Only you can see this."
          className="w-full min-h-[300px] rounded-md border border-tbb-line bg-white p-4 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
      )}
      {error && <p className="text-sm text-tbb-danger">{error}</p>}
    </div>
  );
}
