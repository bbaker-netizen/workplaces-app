"use client";

/**
 * DocumentUploadForm — single-file upload control with optional tags.
 *
 * Used on `/portal/documents` and `/coach/documents/[engagementId]`.
 * The composer paperclip uses a different control (the inline
 * `ComposerAttachmentPicker`) because its UX is different — auto-upload
 * on file pick, no tag step, with abandon-on-cancel.
 *
 * Submits the FormData straight to the `uploadDocument` server action.
 * The action handles tenant + RLS; this component only manages local
 * UI state (selected file, tag chips, pending/error/success messaging).
 */

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  uploadDocument,
  type UploadDocumentResult,
} from "@/lib/actions/documents";
import { formatBytes } from "./utils";

const MAX_BYTES_HINT = "25 MB";

export function DocumentUploadForm({
  engagementId,
  onUploaded,
}: {
  engagementId: string;
  /** Called after a successful upload — page may refresh server data. */
  onUploaded?: (doc: UploadDocumentResult) => void;
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
      className="border border-[#CCCCCC] rounded-md bg-white p-4 space-y-3"
      aria-busy={isPending}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-display font-bold text-foreground text-lg tracking-tight">
          Upload a document
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Up to {MAX_BYTES_HINT}
        </span>
      </div>

      <label className="block">
        <span className="sr-only">Choose a file</span>
        <input
          ref={fileInputRef}
          type="file"
          disabled={isPending}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full font-sans text-sm text-foreground
            file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0
            file:font-sans file:text-xs file:font-bold file:uppercase file:tracking-[0.15em]
            file:bg-[#1A1A1A] file:text-[#F5F1E8] hover:file:bg-[#2E4057] file:cursor-pointer
            file:disabled:opacity-50"
        />
      </label>
      {file && (
        <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {file.name} · {formatBytes(file.size)} ·{" "}
          {file.type || "unknown type"}
        </div>
      )}

      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Tags (comma-separated, optional)
        </span>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          disabled={isPending}
          placeholder="e.g. budget, FY26, contract"
          className="w-full bg-white border border-[#CCCCCC] rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2E4057] focus:border-[#2E4057] disabled:bg-[#F5F1E8] disabled:cursor-wait"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-[#E87722] border border-[#E87722] rounded-md px-3 py-2 bg-[#F5F1E8]"
        >
          {error}
        </p>
      )}
      {success && !isPending && (
        <p className="font-sans text-sm text-[#2E4057] border border-[#CCCCCC] rounded-md px-3 py-2 bg-[#F5F1E8]">
          {success}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !file}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057] disabled:opacity-50 disabled:cursor-wait transition-colors"
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
