"use client";

/**
 * DriveFolderMatcher — "Scan my Drive → link client folders".
 *
 * Scans the coach's Drive folders, pre-fills a name match per engagement,
 * and lets the coach link them in bulk OR type-to-search the right folder
 * for any client whose name doesn't match. Linking is a read-only mirror.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderSearch, Link as LinkIcon, Loader2 } from "lucide-react";
import {
  linkEngagementDriveFolder,
  scanDriveFolderMatches,
  type DriveFolderMatch,
  type DriveFolderOption,
} from "@/lib/actions/engagement-drive";

export function DriveFolderMatcher() {
  const router = useRouter();
  const [matches, setMatches] = useState<DriveFolderMatch[] | null>(null);
  const [folders, setFolders] = useState<DriveFolderOption[]>([]);
  // The text typed into each row's search box (defaults to the name match).
  const [query, setQuery] = useState<Record<string, string>>({});
  const [linked, setLinked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // Resolve a typed folder name back to its id (first match wins).
  const idByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of folders) {
      if (!m.has(f.folderName)) m.set(f.folderName, f.folderId);
    }
    return m;
  }, [folders]);

  function resolveId(engagementId: string): string | null {
    const q = (query[engagementId] ?? "").trim();
    return q ? (idByName.get(q) ?? null) : null;
  }

  function scan() {
    setError(null);
    startTransition(async () => {
      const r = await scanDriveFolderMatches();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const initQuery: Record<string, string> = {};
      for (const m of r.matches) {
        if (m.suggestion) initQuery[m.engagementId] = m.suggestion.folderName;
      }
      setMatches(r.matches);
      setFolders(r.folders);
      setQuery(initQuery);
      setLinked({});
    });
  }

  function linkOne(engagementId: string) {
    const folderId = resolveId(engagementId);
    if (!folderId) return;
    setError(null);
    startTransition(async () => {
      const r = await linkEngagementDriveFolder({
        engagementId,
        folderUrlOrId: folderId,
      });
      if (r.ok) setLinked((p) => ({ ...p, [engagementId]: true }));
      else setError(r.error);
      router.refresh();
    });
  }

  function linkAll() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      for (const m of matches) {
        if (linked[m.engagementId]) continue;
        const folderId = resolveId(m.engagementId);
        if (!folderId) continue;
        const r = await linkEngagementDriveFolder({
          engagementId: m.engagementId,
          folderUrlOrId: folderId,
        });
        if (r.ok) setLinked((p) => ({ ...p, [m.engagementId]: true }));
        else {
          setError(r.error);
          break;
        }
      }
      router.refresh();
    });
  }

  const pendingCount = useMemo(() => {
    if (!matches) return 0;
    return matches.filter(
      (m) => !linked[m.engagementId] && resolveId(m.engagementId),
    ).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, query, linked, idByName]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={scan}
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-navy text-white hover:bg-tbb-blue disabled:opacity-50 shadow-tbb-cta"
        >
          {busy && !matches ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <FolderSearch className="w-4 h-4" aria-hidden />
          )}
          {matches ? "Re-scan my Drive" : "Scan my Drive"}
        </button>
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={linkAll}
            disabled={busy}
            className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white disabled:opacity-50"
          >
            Link {pendingCount} ready
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50">
          {error}
        </p>
      )}

      {matches && (
        <p className="text-xs text-tbb-ink-3">
          Start typing a folder name to search — the box filters your{" "}
          {folders.length} Drive folders. Where the names matched we filled it
          in for you.
        </p>
      )}

      {/* One shared list powers the type-ahead on every row. */}
      <datalist id="drive-folder-options">
        {folders.map((f) => (
          <option key={f.folderId} value={f.folderName} />
        ))}
      </datalist>

      {matches && matches.length === 0 && (
        <p className="text-sm text-tbb-ink-3">No active clients to match.</p>
      )}

      {matches && matches.length > 0 && (
        <ul className="space-y-2">
          {matches.map((m) => {
            const isLinked = linked[m.engagementId];
            const q = query[m.engagementId] ?? "";
            const resolvable = Boolean(resolveId(m.engagementId));
            return (
              <li
                key={m.engagementId}
                className="flex items-center gap-3 rounded-lg border border-tbb-line bg-white px-4 py-3 shadow-tbb-xs flex-wrap sm:flex-nowrap"
              >
                <div className="min-w-0 sm:w-48 shrink-0">
                  <p className="font-bold text-tbb-navy truncate">
                    {m.engagementName}
                  </p>
                  <p className="text-[11px] uppercase tracking-tbb-caps font-bold text-tbb-ink-4">
                    {m.alreadyLinked
                      ? "Already linked"
                      : m.suggestion
                        ? "Name match"
                        : "Search for the folder"}
                  </p>
                </div>
                <input
                  type="text"
                  list="drive-folder-options"
                  value={q}
                  placeholder="Type to search your Drive folders…"
                  onChange={(e) =>
                    setQuery((p) => ({
                      ...p,
                      [m.engagementId]: e.target.value,
                    }))
                  }
                  disabled={busy}
                  className="flex-1 min-w-0 bg-white border border-tbb-line rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
                />
                {isLinked ? (
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-success">
                    <Check className="w-3.5 h-3.5" aria-hidden /> Linked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => linkOne(m.engagementId)}
                    disabled={busy || !resolvable}
                    title={
                      resolvable
                        ? undefined
                        : "Pick a folder from the list first"
                    }
                    className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
                  >
                    <LinkIcon className="w-3.5 h-3.5" aria-hidden /> Link
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
