"use client";

/**
 * DeleteProspectButton — destructive action on the prospect detail
 * page. Requires confirm() so accidental clicks don't trash records.
 *
 * On success, redirects back to /coach/pipeline.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteProspect } from "@/lib/actions/prospects";

export function DeleteProspectButton({
  prospectId,
  prospectLabel,
}: {
  prospectId: string;
  prospectLabel: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (
      !window.confirm(
        `Delete prospect "${prospectLabel}"?\n\n` +
          `This removes them from the pipeline, deletes their activity log + ` +
          `communications, and can't be undone.\n\n` +
          `Type OK in your head and click Confirm to proceed.`,
      )
    )
      return;

    setError(null);
    startTransition(async () => {
      const r = await deleteProspect(prospectId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/coach/pipeline");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-danger text-tbb-danger hover:bg-tbb-danger hover:text-white transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="w-3.5 h-3.5" aria-hidden />
        )}
        Delete prospect
      </button>
      {error && (
        <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
          {error}
        </p>
      )}
    </div>
  );
}
