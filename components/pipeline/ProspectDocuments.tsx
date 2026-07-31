"use client";

/**
 * Documents on a lead's file — where the PDF from The Climb lands (auto via
 * the ingest endpoint, or uploaded here by hand), plus anything else you
 * want kept on the prospect. Download or remove; kept whether or not they
 * convert.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileSignature,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteProspectDocument,
  uploadProspectDocument,
} from "@/lib/actions/prospect-documents";
import type { ProspectDocument } from "@/lib/db/queries/prospect-documents";
import {
  documentDisplayName,
  documentProvenance,
  envelopeStatusLabel,
  groupDocuments,
  type PresentableDocument,
} from "@/lib/documents/presentation";

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

      <div className="px-5 py-4 space-y-3">
        {documents.length === 0 ? (
          <p className="text-sm text-tbb-ink-4 italic">No documents yet.</p>
        ) : (
          groupDocuments(documents as PresentableDocument[]).map((g) =>
            g.kind === "loose" ? (
              <ul key={g.document.id}>
                <DocumentRow
                  doc={g.document}
                  onDone={() => router.refresh()}
                />
              </ul>
            ) : (
              // An agreement is ONE thing with two files under it. Shown
              // flat, the sent copy and the executed copy read as
              // near-duplicates days apart and invite a tidy-up that
              // destroys the contract.
              <section
                key={g.envelopeId}
                className="rounded-md border border-tbb-line bg-tbb-paper/40"
              >
                <header className="flex items-center gap-2 px-3 py-2 border-b border-tbb-line-soft">
                  <FileSignature
                    className="w-3.5 h-3.5 text-tbb-blue flex-none"
                    aria-hidden
                  />
                  <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 truncate">
                    {g.subject}
                  </span>
                  {g.status && (
                    <span
                      className={
                        "ml-auto flex-none text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-0.5 rounded-pill border " +
                        (g.status === "completed"
                          ? "border-tbb-blue text-tbb-blue"
                          : g.status === "voided"
                            ? "border-tbb-line text-tbb-ink-4"
                            : "border-tbb-accent text-tbb-accent")
                      }
                    >
                      {envelopeStatusLabel(g.status)}
                    </span>
                  )}
                </header>
                <ul className="p-2 space-y-1.5">
                  {g.documents.map((d) => (
                    <DocumentRow
                      key={d.id}
                      doc={d}
                      onDone={() => router.refresh()}
                    />
                  ))}
                </ul>
                {g.documents.length > 1 && (
                  <p className="px-3 pb-2 text-[11px] text-tbb-ink-3">
                    Two halves of the same agreement — not duplicates.
                  </p>
                )}
              </section>
            ),
          )
        )}
      </div>
    </Wrapper>
  );
}

function DocumentRow({
  doc,
  onDone,
}: {
  doc: PresentableDocument;
  onDone: () => void;
}) {
  const label = documentDisplayName(doc);
  return (
    <li className="flex items-center gap-3 group rounded-md border border-tbb-line bg-white px-3 py-2">
      <FileText className="w-4 h-4 text-tbb-blue flex-none" aria-hidden />
      <span className="flex-1 min-w-0">
        <a
          href={`/api/documents/${doc.id}/download`}
          className="block text-sm font-medium text-tbb-navy hover:text-tbb-blue truncate"
        >
          {label}
        </a>
        <span className="block text-[11px] text-tbb-ink-3">
          {prettySize(doc.sizeBytes)} · {documentProvenance(doc)} ·{" "}
          {new Date(doc.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </span>
      <a
        href={`/api/documents/${doc.id}/download`}
        aria-label={`Download ${label}`}
        className="text-tbb-ink-3 hover:text-tbb-blue flex-none"
      >
        <Download className="w-4 h-4" aria-hidden />
      </a>
      <DeleteButton
        docId={doc.id}
        // An executed agreement is the one file in here that cannot be
        // reproduced. The confirm names it rather than asking a generic
        // question about "this document".
        confirmMessage={
          doc.envelopeRole === "signed"
            ? `Remove the SIGNED copy of "${doc.envelopeSubject ?? "this agreement"}"? This is the executed contract and it cannot be regenerated.`
            : doc.envelopeRole === "source"
              ? `Remove the copy that was sent for signature? The signed copy stays on file.`
              : "Remove this document from the lead's file?"
        }
        onDone={onDone}
      />
    </li>
  );
}

function DeleteButton({
  docId,
  confirmMessage,
  onDone,
}: {
  docId: string;
  confirmMessage: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remove document"
      onClick={() => {
        if (!window.confirm(confirmMessage)) return;
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
