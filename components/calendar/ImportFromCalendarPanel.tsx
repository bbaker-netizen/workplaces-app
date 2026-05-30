"use client";

/**
 * ImportFromCalendarPanel — lists upcoming Google Calendar events that
 * aren't yet in the app and lets the Business Builder pull any of them in
 * as a BBS session for a chosen client (#5).
 *
 * Per-event control is deliberate: a calendar holds all sorts of events,
 * so the Business Builder picks which ones are actually client sessions
 * rather than importing the whole calendar.
 */

import { useState, useTransition } from "react";
import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { importGoogleEventAsSession } from "@/lib/actions/calendar-import";

type ExternalEvent = {
  id: string;
  summary: string;
  startIso: string;
  startLabel: string;
};

type EngagementOption = { id: string; name: string };

export function ImportFromCalendarPanel({
  events,
  engagements,
}: {
  events: ExternalEvent[];
  engagements: EngagementOption[];
}) {
  const [open, setOpen] = useState(false);

  if (events.length === 0 || engagements.length === 0) return null;

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-tbb-cream-50"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-bold text-tbb-navy">
          <CalendarPlus className="w-4 h-4 text-tbb-blue" aria-hidden />
          Import sessions from your Google Calendar
        </span>
        <span className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue">
          {events.length} event{events.length === 1 ? "" : "s"} found{" "}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="border-t border-tbb-line-soft divide-y divide-tbb-line-soft">
          <p className="px-4 py-2 text-xs text-tbb-ink-3 bg-tbb-cream-50">
            Pick which calendar events are client sessions and import them.
            The original calendar event stays put — it just shows up in the
            app too.
          </p>
          {events.map((ev) => (
            <ImportRow key={ev.id} event={ev} engagements={engagements} />
          ))}
        </div>
      )}
    </section>
  );
}

function ImportRow({
  event,
  engagements,
}: {
  event: ExternalEvent;
  engagements: EngagementOption[];
}) {
  const [engagementId, setEngagementId] = useState("");
  const [type, setType] = useState("in_person");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function doImport() {
    setError(null);
    if (!engagementId) {
      setError("Pick a client first.");
      return;
    }
    startTransition(async () => {
      const r = await importGoogleEventAsSession({
        engagementId,
        googleEventId: event.id,
        startAtIso: event.startIso,
        summary: event.summary,
        type,
      });
      if (!r.ok) setError(r.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <div className="px-4 py-3 flex items-center gap-2 text-sm text-tbb-blue">
        <Check className="w-4 h-4" aria-hidden />
        Imported <span className="font-bold">{event.summary}</span> as a session.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-tbb-navy truncate">{event.summary}</p>
        <p className="text-xs text-tbb-ink-3">{event.startLabel}</p>
        {error && <p className="text-xs text-tbb-danger mt-1">{error}</p>}
      </div>
      <select
        value={engagementId}
        onChange={(e) => setEngagementId(e.target.value)}
        disabled={isPending}
        className="bg-white border border-tbb-line rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tbb-blue"
      >
        <option value="">Which client?</option>
        {engagements.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        disabled={isPending}
        className="bg-white border border-tbb-line rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-tbb-blue"
      >
        <option value="in_person">In person</option>
        <option value="virtual">Virtual</option>
      </select>
      <button
        type="button"
        onClick={doImport}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <CalendarPlus className="w-3.5 h-3.5" aria-hidden />
        )}
        Import
      </button>
    </div>
  );
}
