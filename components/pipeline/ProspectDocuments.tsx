"use client";

/**
 * Documents on a lead's file — where the PDF from The Climb lands (auto via
 * the ingest endpoint, or uploaded here by hand), plus anything else you
 * want kept on the prospect. Download or remove; kept whether or not they
 * convert.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import {
  deleteProspectDocument,
  uploadProspectDocument,
} from "@/lib/actions/prospect-documents";
import type { ProspectDocument } from "@/lib/db/queries/prospect-documents";

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProspectDocuments({
  prospectId,
  documents,
  embedded = false,
}: {
  prospectId: string;
  documents: ProspectDocument[];
  /** When rendered inside a CollapsibleSection, drop the card chrome +
   *  title (the drawer supplies them) and float the Upload button. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("prospectId", prospectId);
    fd.set("file", file);
    startUpload(async () => {
      const r = await uploadProspectDocument(fd);
      if (fileRef.current) fileRef.current.value = "";
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  const uploadButton = (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={isUploading}
      className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps px-2.5 py-1 rounded-pill border border-tbb-line bg-white hover:border-tbb-blue disabled:opacity-50"
    >
      {isUploading ? (
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
      ) : (
        <Upload className="w-3 h-3" aria-hidden />
      )}
      Upload
    </button>
  );

  const Wrapper = embedded ? "div" : "section";

  return (
    <Wrapper
      className={
        embedded
          ? ""
          : "border border-tbb-line rounded-lg bg-white shadow-tbb-sm"
      }
    >
      {embedded ? (
        <div className="px-5 pt-4 flex justify-end">{uploadButton}</div>
      ) : (
        <header className="px-5 py-3 border-b border-tbb-line-soft flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            <FileText className="w-3.5 h-3.5" aria-hidden />
            Documents on file
          </h2>
          {uploadButton}
        </header>
      )}
      <input ref={fileRef} type="file" onChange={onFile} className="hidden" />

      <p className="px-5 pt-3 text-[11px] text-tbb-ink-3">
        The PDF from The Climb auto-saves here; you can also upload anything
        by hand. Kept on the lead&apos;s file whether or not they convert.
      </p>

      {error && <p className="px-5 pt-2 text-sm text-tbb-danger">{error}</p>}

      <ul className="px-5 py-4 space-y-2">
        {documents.length === 0 ? (
          <li className="text-sm text-tbb-ink-4 italic">
            No documents yet.
          </li>
        ) : (
          documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 group rounded-md border border-tbb-line px-3 py-2"
            >
              <FileText className="w-4 h-4 text-tbb-blue flex-none" aria-hidden />
              <span className="flex-1 min-w-0">
                <a
                  href={`/api/documents/${d.id}/download`}
                  className="block text-sm font-medium text-tbb-navy hover:text-tbb-blue truncate"
                >
                  {d.filename}
                </a>
                <span className="block text-[11px] text-tbb-ink-3">
                  {prettySize(d.sizeBytes)}
                  {d.uploaderName ? ` · ${d.uploaderName}` : " · The Climb"} ·{" "}
                  {new Date(d.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </span>
              <a
                href={`/api/documents/${d.id}/download`}
                aria-label={`Download ${d.filename}`}
                className="text-tbb-ink-3 hover:text-tbb-blue flex-none"
              >
                <Download className="w-4 h-4" aria-hidden />
              </a>
              <DeleteButton docId={d.id} onDone={() => router.refresh()} />
            </li>
          ))
        )}
      </ul>
    </Wrapper>
  );
}

function DeleteButton({
  docId,
  onDone,
}: {
  docId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remove document"
      onClick={() => {
        if (!window.confirm("Remove this document from the lead's file?")) return;
        startTransition(async () => {
          const r = await deleteProspectDocument(docId);
          if (r.ok) onDone();
          else window.alert(r.error);
        });
      }}
      disabled={isPending}
      className="text-tbb-ink-4 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-tbb-danger flex-none disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="w-3.5 h-3.5" aria-hidden />
      )}
    </button>
  );
}
