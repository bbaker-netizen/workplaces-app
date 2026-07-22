"use client";

/**
 * LinkedSeriesRow — one linked Google touch-base, with an Unlink action.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { unlinkGoogleSeries } from "@/lib/actions/session-series";

export function LinkedSeriesRow({
  seriesId,
  title,
  scheduleHint,
}: {
  seriesId: string;
  title: string;
  scheduleHint: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function unlink() {
    if (
      !window.confirm(
        `Stop syncing "${title}" from Google? Upcoming meetings with no agenda are removed; ones you've already prepped are kept.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await unlinkGoogleSeries(seriesId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-tbb-line bg-white px-4 py-3 shadow-tbb-xs">
      <div className="flex items-center gap-3 flex-wrap">
        <CalendarClock className="w-4 h-4 text-tbb-blue shrink-0" aria-hidden />
        <span className="font-sans text-sm font-bold text-tbb-navy">
          {title}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-ink-3">
          {scheduleHint} · from Google Calendar
        </span>
        <button
          type="button"
          onClick={unlink}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-orange disabled:opacity-50"
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
          Unlink
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 font-sans text-sm text-tbb-orange">
          {error}
        </p>
      )}
    </li>
  );
}
