"use client";

/**
 * One-click "Convert to active engagement" — creates the engagement +
 * portal (no client invite, no email) and drops the coach into the new
 * engagement's Workspace to start preparing it.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { activateProspectAsEngagement } from "@/lib/actions/activate-engagement";

export function ActivateEngagementButton({
  prospectId,
}: {
  prospectId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    startTransition(async () => {
      const r = await activateProspectAsEngagement(prospectId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/business-builder/engagements/${r.data.engagementId}`);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta disabled:opacity-50"
      >
        {isPending && (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        )}
        {isPending ? "Activating…" : "Convert to active engagement →"}
      </button>
      {error && <p className="text-sm text-tbb-danger">{error}</p>}
    </div>
  );
}
