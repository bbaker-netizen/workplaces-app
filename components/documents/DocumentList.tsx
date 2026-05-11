"use client";

/**
 * DocumentList — table of uploaded files with delete + tag controls.
 *
 * Server-fetched rows come in via props. Each row links to the
 * download route (browser handles content-disposition: attachment).
 * Delete is gated to the uploader OR a leadership role on the server
 * — the action returns an error otherwise; we surface it inline.
 */

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";
import {
  deleteDocument,
  setDocumentTags,
} from "@/lib/actions/documents";
import { formatBytes, fileIconFor } from "./utils";

export type DocumentRow = {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  uploaderName: string;
  createdAt: Date;
  tags: string[];
  /** Whether the viewer is allowed to attempt delete. */
  canDelete: boolean;
};

export function DocumentList({ rows }: { rows: DocumentRow[] }) {
  // Optimistic deletion: hide the row instantly, restore on failure.
  const [optimisticDeleted, addOptimisticDeleted] = useOptimistic<
    Set<string>,
    string
  >(new Set(), (state, id) => new Set(state).add(id));

  if (rows.length === 0) {
    return (
      <div className="border border-tbb-line rounded-md bg-white p-6 font-sans text-sm text-muted-foreground italic">
        No documents yet. Upload one above to get started.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
      {rows
        .filter((r) => !optimisticDeleted.has(r.id))
        .map((row) => (
          <li key={row.id}>
            <DocumentRowView
              row={row}
              onOptimisticDelete={addOptimisticDeleted}
            />
          </li>
        ))}
    </ul>
  );
}

function DocumentRowView({
  row,
  onOptimisticDelete,
}: {
  row: DocumentRow;
  onOptimisticDelete: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingTags, setEditingTags] = useState(false);
  const [tagsDraft, setTagsDraft] = useState(row.tags.join(", "));

  const onDelete = () => {
    if (!row.canDelete) return;
    if (
      !window.confirm(
        `Delete "${row.filename}"? This removes it from the engagement permanently.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      onOptimisticDelete(row.id);
      const result = await deleteDocument(row.id);
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const onSaveTags = () => {
    const tags = tagsDraft
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setError(null);
    startTransition(async () => {
      const result = await setDocumentTags(row.id, tags);
      if (!result.ok) {
        setError(result.error);
      } else {
        setEditingTags(false);
      }
    });
  };

  return (
    <div className="py-3 flex items-start gap-3">
      <span aria-hidden className="text-2xl pt-0.5 select-none">
        {fileIconFor(row.fileType)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <Link
            href={`/api/documents/${row.id}/download`}
            className="font-sans text-sm font-bold text-foreground hover:text-tbb-blue underline-offset-4 hover:underline truncate"
          >
            {row.filename}
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            {formatBytes(row.sizeBytes)}
          </span>
        </div>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Uploaded by {row.uploaderName} ·{" "}
          {row.createdAt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
        <div className="mt-2">
          {editingTags ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                disabled={isPending}
                placeholder="comma-separated, e.g. budget, FY26"
                className="flex-1 min-w-[200px] bg-white border border-tbb-line rounded px-2 py-1 font-sans text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
              <button
                type="button"
                onClick={onSaveTags}
                disabled={isPending}
                className="font-sans text-[10px] uppercase tracking-tbb-caps font-bold px-2 py-1 rounded bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingTags(false);
                  setTagsDraft(row.tags.join(", "));
                }}
                disabled={isPending}
                className="font-sans text-[10px] uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {row.tags.length === 0 ? (
                <span className="font-sans text-xs italic text-muted-foreground">
                  No tags
                </span>
              ) : (
                row.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-full border border-tbb-line bg-tbb-cream-50 text-foreground px-2 py-0.5 text-xs"
                  >
                    {t}
                  </span>
                ))
              )}
              <button
                type="button"
                onClick={() => setEditingTags(true)}
                className="font-sans text-[10px] uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                {row.tags.length === 0 ? "Add tags" : "Edit tags"}
              </button>
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1 font-sans text-xs text-tbb-danger">
            {error}
          </p>
        )}
      </div>
      {row.canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          aria-label={`Delete ${row.filename}`}
          className="p-1.5 rounded text-muted-foreground hover:text-tbb-danger hover:bg-tbb-cream-50 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="w-4 h-4" aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}
