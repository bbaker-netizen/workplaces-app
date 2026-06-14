"use client";

/**
 * Permanently delete an already-archived engagement (and all its
 * workspace data). Double-confirm because it's irreversible. Only
 * rendered in the Archived section of the engagements list.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteEngagementPermanently } from "@/lib/actions/engagements";

export function DeleteEngagementButton({
  engagementId,
  engagementName,
}: {
  engagementId: string;
  engagementName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    const ok = window.confirm(
      `Permanently delete "${engagementName}" and everything in it ` +
        `(sessions, action items, projects, documents, deliverables, ` +
        `messages)?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteEngagementPermanently(engagementId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-[11px] text-tbb-danger">{error}</span>}
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        title="Permanently delete this client"
        className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1.5 rounded-pill border border-tbb-danger/40 text-tbb-danger hover:bg-tbb-danger hover:text-white transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="w-3 h-3" aria-hidden />
        )}
        Delete
      </button>
    </span>
  );
}
