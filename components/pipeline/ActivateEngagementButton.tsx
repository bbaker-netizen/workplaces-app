"use client";

/**
 * "Convert to active engagement" — creates the engagement + portal (no
 * client invite, no email) and drops the coach into the new engagement's
 * Workspace to start preparing it.
 *
 * The coach confirms the PROGRAM here (Accelerator / Implementer),
 * defaulted to whatever's already on the prospect. That choice is the
 * single source of truth — it's written to the prospect AND the
 * engagement, so the Engagements list and Client Portal agree from the
 * first second instead of silently defaulting to Accelerator.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { activateProspectAsEngagement } from "@/lib/actions/activate-engagement";

export function ActivateEngagementButton({
  prospectId,
  currentProgram,
}: {
  prospectId: string;
  /** The program already set on the prospect, if any. */
  currentProgram?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<"accelerator" | "implementer">(
    currentProgram === "implementer" ? "implementer" : "accelerator",
  );

  function go() {
    setError(null);
    startTransition(async () => {
      const r = await activateProspectAsEngagement(prospectId, program);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/business-builder/engagements/${r.data.engagementId}`);
    });
  }

  return (
    <div className="space-y-2.5">
      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Program
        </span>
        <div className="relative">
          <select
            value={program}
            onChange={(e) =>
              setProgram(e.target.value as "accelerator" | "implementer")
            }
            disabled={isPending}
            className="appearance-none w-full bg-white border border-tbb-line rounded-md pl-3 pr-9 py-2 text-sm font-bold text-tbb-navy cursor-pointer focus:outline-none focus:ring-2 focus:ring-tbb-blue disabled:opacity-50"
          >
            <option value="accelerator">Accelerator</option>
            <option value="implementer">Implementer</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tbb-ink-3"
            aria-hidden
          />
        </div>
      </label>
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
