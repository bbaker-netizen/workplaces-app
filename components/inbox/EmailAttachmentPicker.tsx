"use client";

/**
 * EmailAttachmentPicker — lets a Business Builder attach existing documents
 * (the Climb PDF, or anything on the prospect/engagement) to an outgoing
 * email straight from the composer. Selected docs surface as removable chips;
 * on send, the composer passes their ids to sendClientMessage, which resolves
 * the bytes server-side. No re-upload needed.
 */

import { useEffect, useRef, useState } from "react";
import { Paperclip, Loader2, X, FileText } from "lucide-react";
import {
  listAttachableDocuments,
  type AttachableDocument,
} from "@/lib/actions/attachable-documents";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailAttachmentPicker({
  prospectId,
  engagementId,
  selectedIds,
  onChange,
}: {
  prospectId?: string | null;
  engagementId?: string | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [docs, setDocs] = useState<AttachableDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Load the document list lazily the first time the picker is opened.
  useEffect(() => {
    if (!open || loaded || loading) return;
    setLoading(true);
    setError(null);
    listAttachableDocuments({ prospectId, engagementId })
      .then((r) => {
        if (r.ok) setDocs(r.documents);
        else setError(r.error);
        setLoaded(true);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't load documents."),
      )
      .finally(() => setLoading(false));
  }, [open, loaded, loading, prospectId, engagementId]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectedDocs = docs.filter((d) => selectedIds.includes(d.id));

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative inline-block" ref={boxRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:text-tbb-blue-700"
        >
          <Paperclip className="w-3.5 h-3.5" aria-hidden />
          Attach document
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-80 max-h-72 overflow-y-auto rounded-lg border border-tbb-line bg-white shadow-tbb-md p-1.5">
            {loading && (
              <p className="flex items-center gap-2 text-xs text-tbb-ink-3 px-2 py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                Loading documents…
              </p>
            )}
            {error && (
              <p className="text-xs text-tbb-danger px-2 py-3">{error}</p>
            )}
            {!loading && !error && docs.length === 0 && (
              <p className="text-xs text-tbb-ink-3 px-2 py-3">
                No documents on file for this client yet. Run The Climb or
                upload a file first.
              </p>
            )}
            {docs.map((d) => {
              const checked = selectedIds.includes(d.id);
              return (
                <label
                  key={d.id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-tbb-cream-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(d.id)}
                    className="accent-tbb-blue"
                  />
                  <FileText
                    className="w-4 h-4 text-tbb-ink-3 shrink-0"
                    aria-hidden
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-tbb-navy truncate">
                      {d.filename}
                    </span>
                    <span className="block text-[11px] text-tbb-ink-3">
                      {fmtSize(d.sizeBytes)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {selectedDocs.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selectedDocs.map((d) => (
            <li
              key={d.id}
              className="inline-flex items-center gap-1.5 text-[11px] bg-tbb-blue-100 text-tbb-navy rounded-pill pl-2.5 pr-1 py-1"
            >
              <FileText className="w-3 h-3" aria-hidden />
              <span className="max-w-[12rem] truncate">{d.filename}</span>
              <button
                type="button"
                onClick={() => toggle(d.id)}
                className="rounded-full hover:bg-tbb-blue/20 p-0.5"
                aria-label={`Remove ${d.filename}`}
              >
                <X className="w-3 h-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
