"use client";

/**
 * Archive / restore an engagement (client). Archiving removes them from
 * the Engagements list and closes their portal; restoring brings both
 * back. Reversible — no data is destroyed.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import {
  archiveEngagement,
  unarchiveEngagement,
} from "@/lib/actions/engagements";

export function EngagementArchiveButton({
  engagementId,
  engagementName,
  archived,
  variant = "icon",
}: {
  engagementId: string;
  engagementName: string;
  archived: boolean;
  /** "icon" = compact list button; "full" = labelled danger-zone button. */
  variant?: "icon" | "full";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    if (
      !archived &&
      !window.confirm(
        `Archive "${engagementName}"?\n\nThey'll drop off your Engagements ` +
          `list and their portal will close. You can restore them anytime — ` +
          `nothing is deleted.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = archived
        ? await unarchiveEngagement(engagementId)
        : await archiveEngagement(engagementId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (variant === "full") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={run}
          disabled={isPending}
          className={
            "inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border transition-colors disabled:opacity-50 " +
            (archived
              ? "border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white"
              : "border-tbb-danger text-tbb-danger hover:bg-tbb-danger hover:text-white")
          }
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : archived ? (
            <ArchiveRestore className="w-3.5 h-3.5" aria-hidden />
          ) : (
            <Archive className="w-3.5 h-3.5" aria-hidden />
          )}
          {archived ? "Restore client" : "Archive client"}
        </button>
        {error && <p className="text-xs text-tbb-danger">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={isPending}
      aria-label={archived ? `Restore ${engagementName}` : `Archive ${engagementName}`}
      title={archived ? "Restore client" : "Archive client"}
      className={
        "shrink-0 p-1.5 rounded hover:bg-white " +
        (archived ? "text-tbb-blue" : "text-tbb-ink-3 hover:text-tbb-danger")
      }
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
      ) : archived ? (
        <ArchiveRestore className="w-3.5 h-3.5" aria-hidden />
      ) : (
        <Archive className="w-3.5 h-3.5" aria-hidden />
      )}
    </button>
  );
}
