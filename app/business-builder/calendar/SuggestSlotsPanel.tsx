"use client";

/**
 * Inline panel on the calendar page: pick a meeting length and the
 * weekday window you accept (e.g. "Tue/Wed/Thu, 10am-4pm Edmonton")
 * and we generate a list of open slots over the next two weeks that
 * don't clash with existing bbs_sessions.
 *
 * Read-only suggestion list — Bruce picks one, copies the time, and
 * proposes it to the client. Future: one-click "Send to client" that
 * fires a Google Calendar invite.
 */

import { useState, useTransition } from "react";
import { CalendarPlus, Clock, Loader2, Sparkles } from "lucide-react";
import { suggestOpenSlots, type SuggestedSlot } from "@/lib/actions/scheduling-suggest";

export function SuggestSlotsPanel() {
  const [open, setOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [horizonDays, setHorizonDays] = useState(14);
  const [dayPicks, setDayPicks] = useState<Set<number>>(
    () => new Set([1, 2, 3, 4]), // Mon-Thu default — Bruce avoids Fridays
  );
  const [startHour, setStartHour] = useState(10);
  const [endHour, setEndHour] = useState(16);
  const [results, setResults] = useState<SuggestedSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleDay(day: number) {
    setDayPicks((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function generate() {
    setError(null);
    setResults(null);
    if (dayPicks.size === 0) {
      setError("Pick at least one weekday.");
      return;
    }
    if (endHour <= startHour) {
      setError("End hour must be after start hour.");
      return;
    }
    startTransition(async () => {
      const r = await suggestOpenSlots({
        durationMinutes,
        horizonDays,
        weekdays: Array.from(dayPicks),
        startHour,
        endHour,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResults(r.data.slots);
    });
  }

  if (!open) {
    return (
      <div className="border border-tbb-line rounded-lg bg-white p-4 shadow-tbb-sm flex items-center gap-3 flex-wrap">
        <Sparkles className="w-5 h-5 text-tbb-blue" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-tbb-navy">
            Need to schedule a new client?
          </p>
          <p className="text-xs text-tbb-ink-3">
            We&apos;ll scan your calendar and suggest open slots that
            match your meeting rules.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
        >
          <CalendarPlus className="w-3.5 h-3.5" aria-hidden />
          Suggest open slots
        </button>
      </div>
    );
  }

  return (
    <div className="border border-tbb-blue/30 bg-tbb-blue-50 rounded-lg p-5 space-y-4 shadow-tbb-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-tbb-blue" aria-hidden />
        <h2 className="font-bold text-tbb-navy">Suggest open meeting slots</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-xs text-tbb-ink-3 hover:text-tbb-navy"
        >
          Close
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Meeting length
          </span>
          <select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          >
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
            <option value={120}>2 hours</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Look out N days
          </span>
          <select
            value={horizonDays}
            onChange={(e) => setHorizonDays(parseInt(e.target.value, 10))}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={21}>21 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Day starts (24h)
          </span>
          <input
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(parseInt(e.target.value || "0", 10))}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Day ends (24h)
          </span>
          <input
            type="number"
            min={1}
            max={24}
            value={endHour}
            onChange={(e) => setEndHour(parseInt(e.target.value || "0", 10))}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Weekdays you accept
        </span>
        <div className="flex flex-wrap gap-1.5">
          {[
            { d: 1, label: "Mon" },
            { d: 2, label: "Tue" },
            { d: 3, label: "Wed" },
            { d: 4, label: "Thu" },
            { d: 5, label: "Fri" },
            { d: 6, label: "Sat" },
            { d: 0, label: "Sun" },
          ].map(({ d, label }) => {
            const active = dayPicks.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                disabled={isPending}
                className={
                  "px-3 py-1.5 rounded-pill text-xs font-bold uppercase tracking-tbb-caps border transition-colors " +
                  (active
                    ? "bg-tbb-navy text-white border-tbb-navy"
                    : "bg-white text-tbb-navy border-tbb-line hover:border-tbb-blue")
                }
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-white"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={isPending}
        className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="w-4 h-4" aria-hidden />
        )}
        {isPending ? "Scanning…" : "Find open slots"}
      </button>

      {results && (
        <div className="border-t border-tbb-blue/20 pt-4 space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-tbb-ink-3 italic">
              No open slots match those rules in the next {horizonDays} days.
              Loosen the weekdays / hours and try again.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-tbb-ink-3">
                {results.length} open slot{results.length === 1 ? "" : "s"} found.
                Click to copy the time to your clipboard.
              </p>
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {results.map((slot, idx) => (
                  <li key={idx}>
                    <SlotChip slot={slot} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SlotChip({ slot }: { slot: SuggestedSlot }) {
  const [copied, setCopied] = useState(false);
  const start = new Date(slot.startIso);
  const end = new Date(slot.endIso);
  const label = `${start.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} – ${end.toLocaleString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(label).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy to clipboard"
      className={
        "w-full text-left px-3 py-2 rounded-md border transition-colors " +
        (copied
          ? "bg-tbb-success/10 border-tbb-success text-tbb-success"
          : "bg-white border-tbb-line text-tbb-navy hover:border-tbb-blue")
      }
    >
      <span className="flex items-center gap-1.5 text-sm font-bold">
        <Clock className="w-3.5 h-3.5" aria-hidden />
        {label}
      </span>
      {copied && (
        <span className="block text-[10px] text-tbb-success mt-0.5">
          Copied!
        </span>
      )}
    </button>
  );
}
