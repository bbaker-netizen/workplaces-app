"use client";

/**
 * DriveFolderMatcher — "Scan my Drive → auto-link client folders".
 *
 * Scans the coach's Drive folders, suggests a match for each engagement
 * by name, and lets the coach link them in bulk (read-only mirror) instead
 * of pasting folder URLs one at a time.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderSearch, Link as LinkIcon, Loader2 } from "lucide-react";
import {
  linkEngagementDriveFolder,
  scanDriveFolderMatches,
  type DriveFolderMatch,
} from "@/lib/actions/engagement-drive";

export function DriveFolderMatcher() {
  const router = useRouter();
  const [matches, setMatches] = useState<DriveFolderMatch[] | null>(null);
  const [linked, setLinked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function scan() {
    setError(null);
    startTransition(async () => {
      const r = await scanDriveFolderMatches();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMatches(r.matches);
      setLinked({});
    });
  }

  function linkOne(m: DriveFolderMatch) {
    if (!m.suggestion) return;
    setError(null);
    startTransition(async () => {
      const r = await linkEngagementDriveFolder({
        engagementId: m.engagementId,
        folderUrlOrId: m.suggestion!.folderId,
      });
      if (r.ok) setLinked((p) => ({ ...p, [m.engagementId]: true }));
      else setError(r.error);
      router.refresh();
    });
  }

  function linkAll() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      for (const m of matches) {
        if (!m.suggestion || m.alreadyLinked || linked[m.engagementId]) continue;
        const r = await linkEngagementDriveFolder({
          engagementId: m.engagementId,
          folderUrlOrId: m.suggestion.folderId,
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

  const linkable = matches?.filter(
    (m) => m.suggestion && !m.alreadyLinked && !linked[m.engagementId],
  );

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
          Scan my Drive
        </button>
        {linkable && linkable.length > 0 && (
          <button
            type="button"
            onClick={linkAll}
            disabled={busy}
            className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white disabled:opacity-50"
          >
            Link all {linkable.length} matched
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50">
          {error}
        </p>
      )}

      {matches && matches.length === 0 && (
        <p className="text-sm text-tbb-ink-3">No active clients to match.</p>
      )}

      {matches && matches.length > 0 && (
        <ul className="space-y-2">
          {matches.map((m) => {
            const isLinked = m.alreadyLinked || linked[m.engagementId];
            return (
              <li
                key={m.engagementId}
                className="flex items-center gap-3 rounded-lg border border-tbb-line bg-white px-4 py-3 shadow-tbb-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-tbb-navy truncate">
                    {m.engagementName}
                  </p>
                  <p className="text-xs text-tbb-ink-3 truncate">
                    {m.suggestion
                      ? `Drive folder: ${m.suggestion.folderName}`
                      : "No matching Drive folder found"}
                  </p>
                </div>
                {isLinked ? (
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-success">
                    <Check className="w-3.5 h-3.5" aria-hidden /> Linked
                  </span>
                ) : m.suggestion ? (
                  <button
                    type="button"
                    onClick={() => linkOne(m)}
                    disabled={busy}
                    className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
                  >
                    <LinkIcon className="w-3.5 h-3.5" aria-hidden /> Link
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-tbb-ink-4">—</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
