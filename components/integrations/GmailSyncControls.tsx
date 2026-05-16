"use client";

/**
 * GmailSyncControls — the per-user "sync now" + pause/resume controls
 * for the Gmail capture integration. Sits inside the Google Workspace
 * settings page. Server actions own the persistence.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import {
  setGmailSyncEnabled,
  syncMyGmailNow,
} from "@/lib/actions/google-calendar";

export function GmailSyncControls({
  enabled: initialEnabled,
  lastSyncedAt,
}: {
  enabled: boolean;
  lastSyncedAt: string | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [lastSync, setLastSync] = useState(lastSyncedAt);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onToggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const r = await setGmailSyncEnabled(next);
      if (!r.ok) setEnabled(!next);
    });
  }

  function onSyncNow() {
    setLastResult(null);
    startTransition(async () => {
      const r = await syncMyGmailNow();
      if (r.ok) {
        const { scanned, captured } = r.data;
        setLastResult(
          captured > 0
            ? `Captured ${captured} new client email${captured === 1 ? "" : "s"} (scanned ${scanned}).`
            : scanned > 0
              ? `Scanned ${scanned} new messages; none matched a client in the CRM.`
              : "Mailbox is up to date.",
        );
        setLastSync(new Date().toISOString());
        router.refresh();
      } else {
        setLastResult(`Couldn't sync: ${r.error}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap pt-2">
      <button
        type="button"
        onClick={onSyncNow}
        disabled={isPending || !enabled}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" aria-hidden />
        )}
        Sync Gmail now
      </button>
      <label className="inline-flex items-center gap-2 text-xs text-tbb-ink-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          disabled={isPending}
          className="rounded"
        />
        <span>Sync automatically every 10 minutes</span>
      </label>
      {lastSync && (
        <span className="text-[11px] text-tbb-ink-3">
          Last synced{" "}
          {new Date(lastSync).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      )}
      {lastResult && (
        <span className="text-[11px] text-tbb-ink-3 w-full">{lastResult}</span>
      )}
    </div>
  );
}
