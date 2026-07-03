"use client";

/**
 * Schedule-a-follow-up panel on the prospect detail page. Sets the
 * Next-action date + note and logs it to the activity timeline.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check } from "lucide-react";
import { scheduleProspectFollowup } from "@/lib/actions/prospect-followup";

export function ScheduleFollowupPanel({
  prospectId,
  currentDate,
  currentNote,
}: {
  prospectId: string;
  /** Existing next-action date as YYYY-MM-DD, if any. */
  currentDate: string | null;
  currentNote: string | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(currentDate ?? "");
  const [note, setNote] = useState(currentNote ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await scheduleProspectFollowup({
        prospectId,
        date,
        note: note.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm">
      <div className="flex items-center gap-2">
        <CalendarPlus className="w-4 h-4 text-tbb-blue" aria-hidden />
        <h2 className="font-bold text-tbb-navy">Schedule a follow-up</h2>
      </div>
      <p className="text-xs text-tbb-ink-3">
        Sets the next-action date and logs it on the timeline below. It also
        surfaces on your console home when it comes due.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Follow-up date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Call re: proposal"
            disabled={pending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !date}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          <CalendarPlus className="w-3.5 h-3.5" aria-hidden />
          {pending ? "Scheduling…" : "Schedule follow-up"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-tbb-success">
            <Check className="w-4 h-4" aria-hidden /> Scheduled.
          </span>
        )}
        {error && <span className="text-sm text-tbb-danger">{error}</span>}
      </div>
    </section>
  );
}
