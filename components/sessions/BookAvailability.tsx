"use client";

/**
 * Client-facing availability picker for booking an additional session.
 * Shows open slots from the Business Builders' calendars (computed
 * server-side), grouped by day. Pick a day, pick a time, confirm — we
 * book it and send a Google Calendar invite with a Meet link.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, Loader2 } from "lucide-react";
import { bookAdHocSession } from "@/lib/actions/book-session";

type Slot = {
  startIso: string;
  label: string;
  builders: { id: string; name: string }[];
};
type Day = { isoDate: string; label: string; slots: Slot[] };

export function BookAvailability({
  engagementId,
  days,
}: {
  engagementId: string;
  days: Day[];
}) {
  const router = useRouter();
  const [activeDay, setActiveDay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  if (days.length === 0) {
    return (
      <p className="text-sm text-tbb-ink-3">
        No open times in the next two weeks. Reach out and we&apos;ll find a
        time that works.
      </p>
    );
  }

  const day = days[Math.min(activeDay, days.length - 1)];

  function book(slot: Slot) {
    const builder = slot.builders[0];
    if (!builder) return;
    const ok = window.confirm(
      `Book ${slot.label} on ${day.label} with ${builder.name}?\n\n` +
        `You'll get a Google Calendar invite with a video link.`,
    );
    if (!ok) return;
    setError(null);
    setBooked(null);
    start(async () => {
      const r = await bookAdHocSession({
        engagementId,
        startIso: slot.startIso,
        builderUserProfileId: builder.id,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBooked(`${day.label} at ${slot.label} with ${builder.name}`);
      router.refresh();
    });
  }

  if (booked) {
    return (
      <div className="rounded-md border border-tbb-success/40 bg-tbb-success/10 px-4 py-3 flex items-start gap-2">
        <Check className="w-4 h-4 text-tbb-success mt-0.5 shrink-0" aria-hidden />
        <p className="text-sm text-tbb-ink-2">
          Booked — <strong className="text-tbb-navy">{booked}</strong>. A
          calendar invite with a video link is on its way to your email.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Day picker */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map((d, i) => (
          <button
            key={d.isoDate}
            type="button"
            onClick={() => setActiveDay(i)}
            className={
              "shrink-0 px-3 py-1.5 rounded-pill text-xs font-bold uppercase tracking-tbb-caps border transition-colors " +
              (i === activeDay
                ? "bg-tbb-blue text-white border-tbb-blue"
                : "bg-white text-tbb-navy border-tbb-line hover:border-tbb-blue")
            }
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Slots for the active day */}
      <div className="flex flex-wrap gap-2">
        {day.slots.map((slot) => {
          const who = slot.builders.map((b) => b.name.split(" ")[0]).join(" / ");
          return (
            <button
              key={slot.startIso}
              type="button"
              onClick={() => book(slot)}
              disabled={isPending}
              title={`Book with ${slot.builders.map((b) => b.name).join(" or ")}`}
              className="inline-flex flex-col items-center gap-0.5 px-3 py-2 rounded-md border border-tbb-line bg-white hover:border-tbb-blue hover:bg-tbb-blue-50 disabled:opacity-50 transition-colors"
            >
              <span className="text-sm font-bold text-tbb-navy tabular-nums">
                {slot.label}
              </span>
              <span className="text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
                {who}
              </span>
            </button>
          );
        })}
      </div>

      {isPending && (
        <p className="text-xs text-tbb-ink-3 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Booking…
        </p>
      )}
      {error && (
        <p className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50">
          {error}
        </p>
      )}
      <p className="text-[11px] text-tbb-ink-3 inline-flex items-center gap-1.5">
        <CalendarCheck className="w-3 h-3" aria-hidden />
        Times shown in Mountain Time. Each slot is 1 hour.
      </p>
    </div>
  );
}
