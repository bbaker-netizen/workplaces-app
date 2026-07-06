"use client";

/**
 * Schedule-a-follow-up panel on the prospect detail page. Sets the
 * Next-action date + time + location + note and logs it to the activity
 * timeline. Location is a plain field here; Google Places autocomplete
 * enhances it separately.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, MapPin, Trash2 } from "lucide-react";
import {
  clearProspectFollowup,
  scheduleProspectFollowup,
} from "@/lib/actions/prospect-followup";
import { LocationInput } from "@/components/pipeline/LocationInput";

export function ScheduleFollowupPanel({
  prospectId,
  currentDate,
  currentTime,
  currentLocation,
  currentNote,
  embedded = false,
}: {
  prospectId: string;
  /** Existing next-action date as YYYY-MM-DD, if any. */
  currentDate: string | null;
  /** Existing next-action time as HH:MM (24h), if any. */
  currentTime: string | null;
  currentLocation: string | null;
  currentNote: string | null;
  /** When inside a CollapsibleSection, drop the card chrome + title. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(currentDate ?? "");
  const [time, setTime] = useState(currentTime ?? "");
  const [location, setLocation] = useState(currentLocation ?? "");
  const [note, setNote] = useState(currentNote ?? "");
  const [pending, startTransition] = useTransition();
  const [removing, startRemove] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A follow-up already exists when the page loaded with a date — the panel
  // is then in "edit" mode (change the fields and Update), and Remove shows.
  const editing = Boolean(currentDate);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await scheduleProspectFollowup({
        prospectId,
        date,
        time: time || null,
        location: location.trim() || null,
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

  function remove() {
    if (!window.confirm("Remove this follow-up? It clears the reminder and its timeline entry.")) {
      return;
    }
    setError(null);
    setSaved(false);
    startRemove(async () => {
      const r = await clearProspectFollowup(prospectId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDate("");
      setTime("");
      setLocation("");
      setNote("");
      router.refresh();
    });
  }

  const Wrapper = embedded ? "div" : "section";
  return (
    <Wrapper
      className={
        embedded
          ? "p-5 space-y-3"
          : "border border-tbb-line rounded-lg bg-white p-5 space-y-3 shadow-tbb-sm"
      }
    >
      {!embedded && (
        <div className="flex items-center gap-2">
          <CalendarPlus className="w-4 h-4 text-tbb-blue" aria-hidden />
          <h2 className="font-bold text-tbb-navy">
            {editing ? "Follow-up" : "Schedule a follow-up"}
          </h2>
        </div>
      )}
      <p className="text-xs text-tbb-ink-3">
        Sets the next-action date, time, and place, and logs it on the timeline
        below. It also surfaces on your console home when it comes due.
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
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Time (optional)
          </span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={pending}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            <MapPin className="w-3 h-3" aria-hidden /> Location (optional)
          </span>
          <LocationInput
            value={location}
            onChange={setLocation}
            placeholder="Start typing an address, or a place / video link"
            disabled={pending}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Call re: proposal"
            disabled={pending}
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={pending || removing || !date}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          <CalendarPlus className="w-3.5 h-3.5" aria-hidden />
          {pending
            ? editing
              ? "Updating…"
              : "Scheduling…"
            : editing
              ? "Update follow-up"
              : "Schedule follow-up"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={remove}
            disabled={pending || removing}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-line text-tbb-ink-3 hover:border-tbb-danger hover:text-tbb-danger disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            {removing ? "Removing…" : "Remove"}
          </button>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-tbb-success">
            <Check className="w-4 h-4" aria-hidden /> Saved.
          </span>
        )}
        {error && <span className="text-sm text-tbb-danger">{error}</span>}
      </div>
    </Wrapper>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";
