"use client";

/**
 * ComposerAttachmentPicker — paperclip button + pending-attachment list
 * for the message composer.
 *
 * UX: clicking the paperclip opens the OS file picker. On selection,
 * the file uploads immediately to the documents store. While the upload
 * is in flight, a chip with a spinner shows up. On success, the chip
 * becomes a removable attachment. Removing it before send purges the
 * uploaded blob via `abandonDocument` so we don't leak storage on
 * abandoned drafts.
 *
 * The MessageComposer holds the array of attached document ids and
 * passes them to `createMessage` at submit.
 */

import { useRef, useState, useTransition } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import {
  abandonDocument,
  uploadDocument,
} from "@/lib/actions/documents";
import { fileIconFor, formatBytes } from "@/components/documents/utils";

export type PendingAttachment = {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  /** True while the file is mid-upload. */
  uploading: boolean;
};

export function ComposerAttachmentPicker({
  engagementId,
  attachments,
  onAttachmentsChange,
  disabled,
}: {
  engagementId: string;
  attachments: PendingAttachment[];
  onAttachmentsChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const next: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      const tempId = `pending-${crypto.randomUUID()}`;
      next.push({
        id: tempId,
        filename: file.name,
        fileType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        uploading: true,
      });
      // Kick off the upload for this file.
      startTransition(async () => {
        const formData = new FormData();
        formData.set("engagementId", engagementId);
        formData.set("file", file);
        const result = await uploadDocument(formData);
        if (!result.ok) {
          // Drop the pending chip and surface the error.
          setError(result.error);
          onAttachmentsChange(
            attachmentsRef.current.filter((a) => a.id !== tempId),
          );
          return;
        }
        // Swap the temp id for the real document id.
        onAttachmentsChange(
          attachmentsRef.current.map((a) =>
            a.id === tempId
              ? {
                  id: result.data.id,
                  filename: result.data.filename,
                  fileType: result.data.fileType,
                  sizeBytes: result.data.sizeBytes,
                  uploading: false,
                }
              : a,
          ),
        );
      });
    }
    onAttachmentsChange([...attachments, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Always-fresh ref so the in-flight upload callback uses the latest
  // attachments array, not the snapshot at upload-start time.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const onRemove = (att: PendingAttachment) => {
    // Optimistically remove from the UI.
    onAttachmentsChange(attachments.filter((a) => a.id !== att.id));
    // If it was already uploaded (real id), purge the blob.
    if (!att.uploading && !att.id.startsWith("pending-")) {
      startTransition(async () => {
        await abandonDocument(att.id);
      });
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        disabled={disabled}
        onChange={(e) => onPickFiles(e.target.files)}
      />
      <button
        type="button"
        aria-label="Attach files"
        title="Attach files"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-tbb-cream-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Paperclip className="w-4 h-4" aria-hidden />
      </button>
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-tbb-line bg-tbb-cream-50 px-2 py-1 text-xs"
            >
              <span aria-hidden className="text-sm leading-none">
                {fileIconFor(a.fileType)}
              </span>
              <span className="font-sans text-foreground max-w-[14rem] truncate">
                {a.filename}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {formatBytes(a.sizeBytes)}
              </span>
              {a.uploading ? (
                <Loader2
                  className="w-3 h-3 animate-spin text-tbb-navy"
                  aria-hidden
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${a.filename}`}
                  onClick={() => onRemove(a)}
                  disabled={disabled}
                  className="p-0.5 rounded text-muted-foreground hover:text-tbb-danger"
                >
                  <X className="w-3 h-3" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="font-sans text-xs text-tbb-danger">
          {error}
        </p>
      )}
    </div>
  );
}
