"use client";

/**
 * Inline + Add deliverable button for the engagement Workspace page.
 * Opens a small inline form (type / title / optional target date),
 * calls createDeliverable, then router.refresh() so the new row
 * appears immediately. Same data shape as the portal-side
 * DeliverablesBoard so the records are interchangeable.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, X } from "lucide-react";
import { createDeliverable } from "@/lib/actions/deliverables";

type DType =
  | "sop"
  | "org_chart"
  | "job_profile"
  | "financial_dashboard"
  | "onboarding_guide"
  | "operations_setup_guide"
  | "business_plan"
  | "marketing_plan"
  | "stages_of_growth_assessment";

const TYPE_OPTIONS: Array<{ value: DType; label: string }> = [
  { value: "sop", label: "SOPs & process flows" },
  { value: "org_chart", label: "Org chart" },
  { value: "job_profile", label: "Job profile & interview guide" },
  { value: "financial_dashboard", label: "Financial dashboard" },
  { value: "onboarding_guide", label: "Onboarding guide" },
  { value: "operations_setup_guide", label: "Operations setup guide" },
  { value: "business_plan", label: "Business plan" },
  { value: "marketing_plan", label: "Marketing plan" },
  {
    value: "stages_of_growth_assessment",
    label: "Stages of growth assessment",
  },
];

export function QuickAddDeliverableButton({
  engagementId,
}: {
  engagementId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DType>("sop");
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    startTransition(async () => {
      const r = await createDeliverable({
        engagementId,
        type,
        title: title.trim(),
        targetDate: targetDate || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Reset + close + repaint.
      setTitle("");
      setTargetDate("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden /> Add deliverable
      </button>
    );
  }

  return (
    <div className="border border-tbb-blue/40 rounded-lg bg-tbb-cream-50 px-4 py-3 space-y-2 w-full max-w-2xl">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-tbb-blue" aria-hidden />
        <p className="font-bold text-tbb-navy text-sm">New deliverable</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
          aria-label="Close"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DType)}
            disabled={isPending}
            className="mt-1 w-full bg-white border border-tbb-line rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Target date (optional)
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            disabled={isPending}
            className="mt-1 w-full bg-white border border-tbb-line rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Title
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. AR Aging dashboard"
          disabled={isPending}
          autoFocus
          className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
      </label>
      {error && (
        <p className="text-sm text-tbb-danger bg-tbb-danger/10 px-3 py-2 rounded-md">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-tbb-ink-2 hover:bg-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="w-3.5 h-3.5" aria-hidden />
          )}
          Create
        </button>
      </div>
    </div>
  );
}
