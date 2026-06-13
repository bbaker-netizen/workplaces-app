"use client";

/**
 * "Reset & re-activate" — for clients set up before the Clerk Production
 * cutover whose portal is broken (e.g. Amardeep). Deletes the orphaned
 * engagement and sends the prospect back to Contract signed so it can be
 * converted again cleanly.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { resetProspectEngagement } from "@/lib/actions/activate-engagement";

export function ResetEngagementButton({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    if (
      !window.confirm(
        "Reset this client's engagement?\n\n" +
          "This DELETES the current engagement + its workspace data and sends " +
          "the prospect back to 'Contract signed' so you can convert it again " +
          "cleanly. Use this for clients whose portal broke before the Clerk " +
          "cutover.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await resetProspectEngagement(prospectId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-danger disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
        ) : (
          <RotateCcw className="w-3 h-3" aria-hidden />
        )}
        Reset &amp; re-activate
      </button>
      {error && <p className="text-sm text-tbb-danger">{error}</p>}
    </div>
  );
}
