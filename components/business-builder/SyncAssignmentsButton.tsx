"use client";

/**
 * SyncAssignmentsButton — master-admin one-click reconciliation that aligns
 * every existing client's assigned Business Builder to the Owner set on its
 * lead. Run once after setting Owners in the Pipeline so "Just mine" and the
 * per-BB views separate correctly. Idempotent.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { syncClientAssignmentsToOwners } from "@/lib/actions/sync-client-assignments";

export function SyncAssignmentsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setMsg(null);
    setError(null);
    start(async () => {
      const r = await syncClientAssignmentsToOwners();
      if (!r.ok) {
        setError(r.error);
      } else {
        setMsg(
          r.reassigned === 0
            ? "Everything's already aligned to its Owner."
            : `${r.reassigned} client${r.reassigned === 1 ? "" : "s"} re-assigned to match their Owner.`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Align every client's assigned Business Builder to the Owner set on its lead"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" aria-hidden />
        )}
        Sync assignments to Owners
      </button>
      {msg && <p className="text-xs text-tbb-navy">{msg}</p>}
      {error && <p className="text-xs text-tbb-danger">{error}</p>}
    </div>
  );
}
