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

import { FolderOpen } from "lucide-react";
import type { DriveFile } from "@/lib/integrations/google-drive";

export function SharedDriveFolder({
  folderName,
  folderId,
  files,
  unavailable,
}: {
  folderName: string | null;
  /** Google Drive folder id — drives the "Open in Drive" link + embed. */
  folderId?: string | null;
  files: DriveFile[];
  /** True when the folder is linked but its contents couldn't be loaded
   *  (e.g. the Business Builder's Google connection needs refreshing). */
  unavailable?: boolean;
}) {
  const folderUrl = folderId
    ? `https://drive.google.com/drive/folders/${folderId}`
    : null;
  // Google's embeddedfolderview *can* be iframed (a raw Drive folder URL
  // can't). Works when the folder is shared "anyone with the link".
  const embedUrl = folderId
    ? `https://drive.google.com/embeddedfolderview?id=${folderId}#list`
    : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-tbb-blue" aria-hidden />
          <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Shared folder{folderName ? ` · ${folderName}` : ""}
          </h2>
        </div>
        {folderUrl && (
          <a
            href={folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1.5 rounded-pill border border-tbb-line text-tbb-blue hover:border-tbb-blue hover:bg-white transition-colors"
          >
            <FolderOpen className="w-3 h-3" aria-hidden /> Open in Google Drive
          </a>
        )}
      </div>

      {embedUrl && (
        <iframe
          src={embedUrl}
          title={`Google Drive folder${folderName ? ` — ${folderName}` : ""}`}
          className="w-full h-72 rounded-md border border-tbb-line bg-white"
        />
      )}

      {unavailable ? (
        <p className="text-sm text-muted-foreground italic border border-tbb-line rounded-md bg-white px-4 py-3">
          This folder is shared with you, but its contents can&apos;t be shown
          right now. Try again shortly, or ask your Business Builder.
        </p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground italic border border-tbb-line rounded-md bg-white px-4 py-3">
          The shared folder is empty right now.
        </p>
      ) : null}
      {/* The custom file/folder list that used to render here was a
          duplicate of the embedded Drive view above, so it was removed.
          The iframe is the single source of the folder's contents. */}
    </section>
  );
}
