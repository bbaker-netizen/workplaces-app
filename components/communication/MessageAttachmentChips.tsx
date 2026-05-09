/**
 * MessageAttachmentChips — list of file chips below a message body.
 *
 * Server component (read-only) — clicking a chip hits the download
 * route, which streams the file with `attachment` disposition. No
 * client-side state needed.
 */

import Link from "next/link";
import { fileIconFor, formatBytes } from "@/components/documents/utils";
import type { AttachedDocument } from "@/lib/db/queries/documents";

export function MessageAttachmentChips({
  attachments,
}: {
  attachments: AttachedDocument[];
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <li key={a.id}>
          <Link
            href={`/api/documents/${a.id}/download`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#CCCCCC] bg-white px-2 py-1 text-xs hover:bg-[#F5F1E8] hover:border-[#666666] transition-colors"
            title={`${a.filename} · ${formatBytes(a.sizeBytes)}`}
          >
            <span aria-hidden className="text-sm leading-none">
              {fileIconFor(a.fileType)}
            </span>
            <span className="font-sans text-foreground max-w-[18rem] truncate">
              {a.filename}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {formatBytes(a.sizeBytes)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
