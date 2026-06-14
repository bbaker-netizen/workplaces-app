"use client";

/**
 * Archive / restore control on the prospect detail page.
 *
 * "Delete" now means archive (soft-delete) — the record, its activity
 * log, and communications are kept and can be restored anytime. When the
 * prospect is already archived this renders a Restore button instead.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { deleteProspect, unarchiveProspect } from "@/lib/actions/prospects";
import {
  hidePendingFeedback,
  showPendingFeedback,
} from "@/components/layout/NavLoaderOverlay";

export function DeleteProspectButton({
  prospectId,
  prospectLabel,
  archived = false,
}: {
  prospectId: string;
  prospectLabel: string;
  archived?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function archive() {
    if (
      !window.confirm(
        `Archive prospect "${prospectLabel}"?\n\n` +
          `They move to the Archived view. Their activity log and ` +
          `communications are kept, and you can restore them anytime.`,
      )
    )
      return;

    setError(null);
    showPendingFeedback("Archiving prospect…");
    startTransition(async () => {
      const r = await deleteProspect(prospectId);
      if (!r.ok) {
        hidePendingFeedback();
        setError(r.error);
        return;
      }
      router.push("/business-builder/pipeline");
      router.refresh();
    });
  }

  function restore() {
    setError(null);
    showPendingFeedback("Restoring prospect…");
    startTransition(async () => {
      const r = await unarchiveProspect(prospectId);
      hidePendingFeedback();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {archived ? (
        <button
          type="button"
          onClick={restore}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <ArchiveRestore className="w-3.5 h-3.5" aria-hidden />
          )}
          Restore prospect
        </button>
      ) : (
        <button
          type="button"
          onClick={archive}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-danger text-tbb-danger hover:bg-tbb-danger hover:text-white transition-colors disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Archive className="w-3.5 h-3.5" aria-hidden />
          )}
          Archive prospect
        </button>
      )}
      {error && (
        <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-tbb-cream-50">
          {error}
        </p>
      )}
    </div>
  );
}
