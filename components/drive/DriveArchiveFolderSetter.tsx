"use client";

/**
 * Lets the coach set their "Archive" Drive folder. When a client is
 * archived, that client's app-managed Drive folder is moved here.
 */

import { useState, useTransition } from "react";
import { Archive, Check, Loader2 } from "lucide-react";
import { setDriveArchiveFolder } from "@/lib/actions/engagement-drive";

export function DriveArchiveFolderSetter({
  initialSet,
}: {
  initialSet: boolean;
}) {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSet, setIsSet] = useState(initialSet);
  const [busy, start] = useTransition();

  function save() {
    setError(null);
    setSaved(null);
    start(async () => {
      const r = await setDriveArchiveFolder(url);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(r.folderName);
      setIsSet(true);
      setUrl("");
    });
  }

  return (
    <div className="rounded-lg border border-tbb-line bg-white p-4 space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        <Archive className="w-3.5 h-3.5" aria-hidden /> Archive folder
        {isSet && (
          <span className="inline-flex items-center gap-1 text-tbb-success">
            <Check className="w-3 h-3" aria-hidden /> set
          </span>
        )}
      </p>
      <p className="text-[11px] text-tbb-ink-3">
        When you archive a client, their app-created (&ldquo;managed&rdquo;)
        Drive folder moves into this folder automatically. Paste the folder&apos;s
        share URL.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
          disabled={busy}
          className="flex-1 min-w-0 bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || url.trim().length < 8}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
          Save
        </button>
      </div>
      {saved && (
        <p className="text-xs text-tbb-success inline-flex items-center gap-1">
          <Check className="w-3.5 h-3.5" aria-hidden /> Saved: {saved}
        </p>
      )}
      {error && <p className="text-xs text-tbb-danger">{error}</p>}
    </div>
  );
}
