"use client";

/**
 * "Sync now" button for the QuickBooks settings page. Triggers a refresh
 * of every client's cached lifetime-payments value so the Pipeline
 * "Value" column updates without waiting for the nightly job.
 */

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { syncQboLifetimeValuesAction } from "@/lib/actions/qbo-value-sync";

export function QuickBooksSyncValuesButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function run() {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const r = await syncQboLifetimeValuesAction();
      if (!r.ok) {
        setIsError(true);
        setMessage(r.error);
        return;
      }
      setIsError(false);
      setMessage(
        `Updated ${r.updated} client${r.updated === 1 ? "" : "s"}` +
          (r.skipped ? `, ${r.skipped} skipped` : "") +
          (r.errors ? `, ${r.errors} errored` : "") +
          ".",
      );
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="w-4 h-4" aria-hidden />
        )}
        {isPending ? "Syncing…" : "Sync now"}
      </button>
      {message && (
        <p
          role={isError ? "alert" : "status"}
          className={
            "font-sans text-sm " +
            (isError ? "text-tbb-danger" : "text-foreground")
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
