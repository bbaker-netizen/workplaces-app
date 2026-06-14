"use client";

/**
 * Engagement status control on the engagement detail page. Switching to
 * Paused or Completed flips the client portal to read-only; Active brings
 * it back. Archiving the originating contact pauses it automatically too.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  setEngagementStatus,
  type SettableEngagementStatus,
} from "@/lib/actions/engagements";

const OPTIONS: { value: SettableEngagementStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

export function EngagementStatusControl({
  engagementId,
  current,
}: {
  engagementId: string;
  current: string;
}) {
  const router = useRouter();
  // Only the three settable values map onto the control; other DB states
  // (prospect/renewed) fall back to showing Active as the closest editable.
  const initial: SettableEngagementStatus =
    current === "paused" || current === "completed" ? current : "active";
  const [value, setValue] = useState<SettableEngagementStatus>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onChange(next: SettableEngagementStatus) {
    const prev = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const r = await setEngagementStatus(engagementId, next);
      if (!r.ok) {
        setValue(prev);
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const readOnly = value === "paused" || value === "completed";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        Status
      </label>
      <select
        value={value}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value as SettableEngagementStatus)}
        className="bg-white border border-tbb-line rounded-md px-2.5 py-1.5 text-sm font-bold text-tbb-navy focus:outline-none focus:ring-2 focus:ring-tbb-blue disabled:opacity-50"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {isPending && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-tbb-ink-3" aria-hidden />
      )}
      {readOnly && !isPending && (
        <span className="text-[11px] text-tbb-warning font-bold">
          Portal is read-only
        </span>
      )}
      {error && <span className="text-[11px] text-tbb-danger">{error}</span>}
    </div>
  );
}
