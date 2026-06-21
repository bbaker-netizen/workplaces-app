"use client";

/**
 * Engagement Drive panel — surfaces the linked Google Drive folder's
 * files in the documents page. Linking is just pasting the folder
 * share URL; the server validates it and pulls the folder name.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Link as LinkIcon,
  Loader2,
  Unlink,
} from "lucide-react";
import {
  createManagedDriveFolder,
  linkEngagementDriveFolder,
  unlinkEngagementDriveFolder,
} from "@/lib/actions/engagement-drive";
import type { DriveFile } from "@/lib/integrations/google-drive";

export function EngagementDrivePanel({
  engagementId,
  linkedFolderId,
  linkedFolderName,
  managed = false,
  files,
  fileFetchError,
  isGoogleConnected,
  hasDriveScope,
  hasDriveWrite = false,
}: {
  engagementId: string;
  linkedFolderId: string | null;
  linkedFolderName: string | null;
  managed?: boolean;
  files: DriveFile[];
  fileFetchError: string | null;
  isGoogleConnected: boolean;
  hasDriveScope: boolean;
  hasDriveWrite?: boolean;
}) {
  const router = useRouter();
  const [linkInput, setLinkInput] = useState("");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function createManaged() {
    setError(null);
    startTransition(async () => {
      const r = await createManagedDriveFolder(engagementId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function submitLink() {
    setError(null);
    startTransition(async () => {
      const r = await linkEngagementDriveFolder({
        engagementId,
        folderUrlOrId: linkInput.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLinkInput("");
      setChanging(false);
      router.refresh();
    });
  }

  function unlink() {
    if (
      !confirm(
        "Unlink the Drive folder? Files stay in Drive — they just won't show up here.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await unlinkEngagementDriveFolder(engagementId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  // Not connected to Google at all — point Bruce at the integration page.
  if (!isGoogleConnected) {
    return (
      <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-2 shadow-tbb-sm">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Google Drive
        </h2>
        <p className="text-sm text-tbb-ink-2">
          Connect Google Workspace to mirror a Drive folder into this
          engagement.
        </p>
        <a
          href="/business-builder/profile/google-calendar"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta w-fit"
        >
          Connect Google
        </a>
      </section>
    );
  }

  // Connected but the saved token doesn't yet have the Drive scope.
  if (!hasDriveScope) {
    return (
      <section className="border border-tbb-warning/40 rounded-lg bg-tbb-warning/10 p-5 space-y-2 shadow-tbb-sm">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Google Drive
        </h2>
        <p className="text-sm text-tbb-ink-2">
          You connected Google before Drive support was added. Reconnect to
          grant the read-only Drive permission — calendar + Gmail won&apos;t
          be affected.
        </p>
        <a
          href="/api/google-calendar/connect"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 w-fit"
        >
          Reconnect Google
        </a>
      </section>
    );
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Google Drive
        </h2>
        {linkedFolderId && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setChanging((c) => !c);
                setError(null);
                setLinkInput("");
              }}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue"
            >
              <LinkIcon className="w-3 h-3" aria-hidden />
              {changing ? "Cancel" : "Change folder"}
            </button>
            <button
              type="button"
              onClick={unlink}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-danger"
            >
              <Unlink className="w-3 h-3" aria-hidden /> Unlink
            </button>
          </div>
        )}
      </div>

      {!linkedFolderId ? (
        <div className="space-y-3">
          <div className="rounded-md border border-tbb-line bg-tbb-cream-50 p-3 space-y-2">
            <p className="text-sm text-tbb-ink-2">
              <span className="font-bold text-tbb-navy">
                Create a managed folder
              </span>{" "}
              — the app makes a folder in your Drive for this client and keeps
              it in sync both ways: files you upload here land in Drive, and
              files you drop in the Drive folder show up here.
            </p>
            {hasDriveWrite ? (
              <button
                type="button"
                onClick={createManaged}
                disabled={isPending}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-navy text-white hover:bg-tbb-blue disabled:opacity-50 shadow-tbb-cta"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <FolderPlus className="w-3.5 h-3.5" aria-hidden />
                )}
                Create managed folder
              </button>
            ) : (
              <a
                href="/api/google-calendar/connect"
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-navy text-white hover:bg-tbb-blue w-fit"
              >
                Reconnect Google to enable two-way
              </a>
            )}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            or link an existing folder (read-only)
          </p>
          <p className="text-sm text-tbb-ink-2">
            Paste the share URL of a Drive folder you already have. Files
            inside it (read-only) appear right below.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              disabled={isPending}
              placeholder="https://drive.google.com/drive/folders/…"
              className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
            <button
              type="button"
              onClick={submitLink}
              disabled={isPending || linkInput.trim().length < 8}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <LinkIcon className="w-3.5 h-3.5" aria-hidden />
              )}
              Link folder
            </button>
          </div>
          {error && (
            <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
              {error}
            </p>
          )}
          <p className="text-[11px] text-tbb-ink-3">
            Tip: in Drive, right-click the folder → Share → Copy link. Paste
            it here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <FolderOpen className="w-4 h-4 text-tbb-blue" aria-hidden />
            <span className="font-bold text-tbb-navy">
              {linkedFolderName ?? "Linked folder"}
            </span>
            {managed && (
              <span className="text-[9px] font-bold uppercase tracking-tbb-caps px-1.5 py-0.5 rounded-pill bg-tbb-success/15 text-tbb-success">
                Two-way
              </span>
            )}
            <a
              href={`https://drive.google.com/drive/folders/${linkedFolderId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
            >
              Open in Drive
              <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
          </div>

          {changing && (
            <div className="rounded-md border border-tbb-line bg-tbb-cream-50 p-3 space-y-2">
              <p className="text-sm text-tbb-ink-2">
                Point this client at a different folder (or a specific
                <strong> sub-folder</strong>). In Drive, open the sub-folder,
                then copy its URL from the address bar (or right-click → Share →
                Copy link) and paste it here.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  disabled={isPending}
                  placeholder="https://drive.google.com/drive/folders/…"
                  className="flex-1 bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
                <button
                  type="button"
                  onClick={submitLink}
                  disabled={isPending || linkInput.trim().length < 8}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  ) : (
                    <LinkIcon className="w-3.5 h-3.5" aria-hidden />
                  )}
                  Re-link
                </button>
              </div>
              {error && (
                <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-white">
                  {error}
                </p>
              )}
            </div>
          )}

          {fileFetchError ? (
            <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
              Couldn&apos;t load files: {fileFetchError}
            </p>
          ) : files.length === 0 ? (
            <p className="text-sm text-tbb-ink-3 italic">
              Folder&apos;s empty (or files are hidden from your share).
            </p>
          ) : (
            <ul className="divide-y divide-tbb-line-soft border-t border-tbb-line-soft pt-2">
              {files.map((f) => (
                <li key={f.id} className="py-2 flex items-center gap-3">
                  {f.iconLink ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.iconLink}
                      alt=""
                      className="w-4 h-4 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <span className="w-4 h-4 shrink-0 bg-tbb-line rounded" />
                  )}
                  <a
                    href={f.webViewLink ?? "#"}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex-1 truncate text-sm text-tbb-navy hover:underline"
                  >
                    {f.name}
                  </a>
                  {f.modifiedTime && (
                    <span className="text-[11px] text-tbb-ink-3 tabular-nums whitespace-nowrap">
                      {new Date(f.modifiedTime).toLocaleDateString()}
                    </span>
                  )}
                  {f.size && (
                    <span className="text-[11px] text-tbb-ink-3 tabular-nums whitespace-nowrap">
                      {formatBytes(f.size)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
