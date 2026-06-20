"use client";

/**
 * DocumentUploadForm — single-file upload control with optional tags.
 *
 * Used on `/portal/documents` and `/business-builder/documents/[engagementId]`.
 * The composer paperclip uses a different control (the inline
 * `ComposerAttachmentPicker`) because its UX is different — auto-upload
 * on file pick, no tag step, with abandon-on-cancel.
 *
 * Submits the FormData straight to the `uploadDocument` server action.
 * The action handles tenant + RLS; this component only manages local
 * UI state (selected file, tag chips, pending/error/success messaging).
 */

import { useRef, useState, useTransition } from "react";
import { HardDrive, Info, Loader2, Upload } from "lucide-react";
import {
  uploadDocument,
  type UploadDocumentResult,
} from "@/lib/actions/documents";
import { formatBytes } from "./utils";

const MAX_BYTES_HINT = "25 MB";

export function DocumentUploadForm({
  engagementId,
  onUploaded,
  hasSharedDriveFolder = false,
}: {
  engagementId: string;
  /** Called after a successful upload — page may refresh server data. */
  onUploaded?: (doc: UploadDocumentResult) => void;
  /** When a Google Drive folder is linked to this engagement, the copy
   *  steers Drive-bound files to the shared folder and frames this upload
   *  as the in-app store. */
  hasSharedDriveFolder?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setFile(null);
    setTags("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    if (!file) {
      setError("Pick a file first.");
      return;
    }
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set("engagementId", engagementId);
    formData.set("file", file);
    if (tags.trim()) formData.set("tags", tags.trim());
    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(`Uploaded "${result.data.filename}".`);
        reset();
        onUploaded?.(result.data);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border border-tbb-line rounded-md bg-white p-4 space-y-3"
      aria-busy={isPending}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-foreground text-lg tracking-tight flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-tbb-ink-3" aria-hidden />
          Upload to The Builder
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
          Up to {MAX_BYTES_HINT}
        </span>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground border border-tbb-line rounded-md bg-tbb-cream-50 px-3 py-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-tbb-ink-3" aria-hidden />
        <span>
          Files added here are stored <strong>inside The Builder</strong> — they
          are <strong>not</strong> copied to{" "}
          {hasSharedDriveFolder ? "the shared Google Drive folder above" : "Google Drive"}.
          {hasSharedDriveFolder ? (
            <>
              {" "}
              To keep something in the shared Drive folder, add it in Google
              Drive instead. Use this for quick, portal-only files (and anything
              attached to messages).
            </>
          ) : (
            <>
              {" "}
              Use this for files you want to live in the portal itself.
            </>
          )}
        </span>
      </p>

      <label className="block">
        <span className="sr-only">Choose a file</span>
        <input
          ref={fileInputRef}
          type="file"
          disabled={isPending}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full font-sans text-sm text-foreground
            file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0
            file:font-sans file:text-xs file:font-bold file:uppercase file:tracking-tbb-caps
            file:bg-tbb-blue file:text-white hover:file:bg-tbb-blue-700 file:cursor-pointer
            file:disabled:opacity-50"
        />
      </label>
      {file && (
        <div className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          {file.name} · {formatBytes(file.size)} ·{" "}
          {file.type || "unknown type"}
        </div>
      )}

      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Tags (comma-separated, optional)
        </span>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          disabled={isPending}
          placeholder="e.g. budget, FY26, contract"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue focus:border-tbb-blue disabled:bg-tbb-cream-50 disabled:cursor-wait"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}
      {success && !isPending && (
        <p className="font-sans text-sm text-tbb-navy border border-tbb-line rounded-md px-3 py-2 bg-tbb-cream-50">
          {success}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !file}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="w-4 h-4" aria-hidden />
          )}
          {isPending ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}
