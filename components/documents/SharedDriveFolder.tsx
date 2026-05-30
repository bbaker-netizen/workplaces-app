/**
 * SharedDriveFolder — read-only view of the Google Drive folder the
 * Business Builder linked to this engagement, shown to the client in
 * their portal (#8). Files open in Google Drive (the folder is shared
 * with them), so this is a live window into the shared folder rather
 * than just a link to it.
 *
 * Presentational only — the file list is fetched server-side using the
 * Business Builder's Google token and passed in.
 */

import { ExternalLink, FileText, Folder, FolderOpen } from "lucide-react";
import type { DriveFile } from "@/lib/integrations/google-drive";

export function SharedDriveFolder({
  folderName,
  files,
  unavailable,
}: {
  folderName: string | null;
  files: DriveFile[];
  /** True when the folder is linked but its contents couldn't be loaded
   *  (e.g. the Business Builder's Google connection needs refreshing). */
  unavailable?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-tbb-blue" aria-hidden />
        <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Shared folder{folderName ? ` · ${folderName}` : ""}
        </h2>
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground italic border border-tbb-line rounded-md bg-white px-4 py-3">
          This folder is shared with you, but its contents can&apos;t be shown
          right now. Try again shortly, or ask your Business Builder.
        </p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground italic border border-tbb-line rounded-md bg-white px-4 py-3">
          The shared folder is empty right now.
        </p>
      ) : (
        <ul className="border border-tbb-line rounded-md bg-white divide-y divide-tbb-line-soft overflow-hidden">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              {f.isFolder ? (
                <Folder className="w-4 h-4 text-tbb-ink-3 shrink-0" aria-hidden />
              ) : (
                <FileText className="w-4 h-4 text-tbb-ink-3 shrink-0" aria-hidden />
              )}
              {f.webViewLink ? (
                <a
                  href={f.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 truncate text-sm text-foreground hover:text-tbb-blue hover:underline underline-offset-4"
                >
                  {f.name}
                </a>
              ) : (
                <span className="flex-1 min-w-0 truncate text-sm text-foreground">
                  {f.name}
                </span>
              )}
              {f.webViewLink && (
                <a
                  href={f.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${f.name} in Google Drive`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline shrink-0"
                >
                  Open <ExternalLink className="w-3 h-3" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
