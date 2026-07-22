"use client";

/**
 * LinkGoogleSeries — connect a recurring Google Calendar event as the
 * team's touch-base. Google owns the schedule; the app reads it in.
 *
 * Collapsed to a button until opened. On open it loads the user's
 * recurring events; picking one links it and pulls its occurrences in.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, Check, Loader2, RefreshCw } from "lucide-react";
import {
  linkGoogleSeries,
  listLinkableGoogleSeries,
} from "@/lib/actions/session-series";

const TZ = "America/Edmonton";

type Option = {
  recurringEventId: string;
  calendarId: string;
  summary: string;
  scheduleHint: string | null;
  nextStart: string | null; // ISO — Dates don't cross the server boundary
};

export function LinkGoogleSeries() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const rows = await listLinkableGoogleSeries();
      setOptions(
        rows.map((r) => ({
          recurringEventId: r.recurringEventId,
          calendarId: r.calendarId,
          summary: r.summary,
          scheduleHint: r.scheduleHint,
          nextStart: r.nextStart ? new Date(r.nextStart).toISOString() : null,
        })),
      );
    } catch {
      setError("Couldn't read your Google Calendar. Is it connected?");
    } finally {
      setLoading(false);
    }
  }

  function openPicker() {
    setOpen(true);
    void load();
  }

  function pick(o: Option) {
    setError(null);
    startTransition(async () => {
      const res = await linkGoogleSeries({
        googleCalendarId: o.calendarId,
        googleRecurringEventId: o.recurringEventId,
        title: o.summary,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex items-center gap-2 rounded-lg border border-tbb-line bg-white px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
      >
        <CalendarPlus className="w-3.5 h-3.5" aria-hidden />
        Link a Google event
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-tbb-line bg-white p-4 shadow-tbb-xs space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-tbb-navy tracking-tight">
          Pick your recurring touch-base
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-blue hover:underline disabled:opacity-50"
        >
          <RefreshCw className={"w-3 h-3 " + (loading ? "animate-spin" : "")} aria-hidden />
          Refresh
        </button>
      </div>

      <p className="font-sans text-xs text-muted-foreground">
        These are the repeating events on your Google Calendar. Pick the
        touch-base you run with the team — the app will mirror it and add
        agendas on top. You keep managing the schedule in Google.
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-tbb-orange/10 border border-tbb-orange/30 px-3 py-2 font-sans text-sm text-tbb-orange"
        >
          {error}
        </p>
      )}

      {loading && (
        <p className="flex items-center gap-2 font-sans text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Reading your calendar…
        </p>
      )}

      {!loading && options && options.length === 0 && (
        <p className="rounded-lg border border-dashed border-tbb-line p-4 text-center font-sans text-sm text-muted-foreground">
          No repeating events found on your calendar in the next year. Create
          the touch-base in Google first, then come back and link it.
        </p>
      )}

      {!loading && options && options.length > 0 && (
        <ul className="space-y-1.5">
          {options.map((o) => (
            <li key={`${o.calendarId}:${o.recurringEventId}`}>
              <button
                type="button"
                disabled={pending}
                onClick={() => pick(o)}
                className="group flex w-full items-center gap-3 rounded-lg border border-tbb-line px-3 py-2 text-left hover:border-tbb-blue hover:bg-tbb-blue/5 disabled:opacity-50 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-sans text-sm font-bold text-tbb-navy truncate">
                    {o.summary}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
                    {o.scheduleHint ?? "Recurring"}
                    {o.nextStart
                      ? ` · next ${new Date(o.nextStart).toLocaleString("en-CA", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: TZ,
                        })}`
                      : ""}
                  </span>
                </span>
                <Check className="w-4 h-4 shrink-0 text-tbb-blue opacity-0 group-hover:opacity-100" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
      >
        Cancel
      </button>
    </div>
  );
}
