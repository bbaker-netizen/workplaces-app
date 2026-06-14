"use client";

/**
 * Add several projects at once — one name per line. Quality-gate flags
 * (revenue / margin) apply to the whole batch; you fill in dates, leads,
 * and tasks per project afterward.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createProjectsBulk } from "@/lib/actions/projects";

export function BulkAddProjects({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [revenue, setRevenue] = useState(true);
  const [margin, setMargin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const names = text
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) {
      setError("Add at least one project name (one per line).");
      return;
    }
    if (!revenue && !margin) {
      setError("Pick revenue and/or margin impact for the batch.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createProjectsBulk({
        engagementId,
        names,
        revenueImpact: revenue,
        marginImpact: margin,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setText("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
      >
        + Add several
      </button>
    );
  }

  return (
    <div className="w-full border border-tbb-line rounded-md bg-white p-3 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isPending}
        rows={4}
        placeholder={"One project per line, e.g.\nHire ops manager\nLaunch new website\nSet up financial dashboard"}
        className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
      />
      <div className="flex items-center gap-4 text-xs text-tbb-ink-2 flex-wrap">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={revenue}
            onChange={(e) => setRevenue(e.target.checked)}
            disabled={isPending}
          />
          Moves revenue
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={margin}
            onChange={(e) => setMargin(e.target.checked)}
            disabled={isPending}
          />
          Protects margin
        </label>
      </div>
      {error && <p className="text-xs text-tbb-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="w-3.5 h-3.5" aria-hidden />
          )}
          Add projects
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={isPending}
          className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
