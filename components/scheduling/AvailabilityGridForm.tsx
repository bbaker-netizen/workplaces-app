"use client";

/**
 * The client-facing availability grid.
 *
 * Ten checkable windows (Mon–Fri × Morning/Afternoon) plus an
 * "It's complicated" escape hatch, because a real schedule often doesn't fit
 * a grid and forcing a wrong answer is worse than collecting a sentence.
 *
 * Confirmation is shown in place on success — the client is a business owner
 * who has just filled in a form from an email, and leaving them wondering
 * whether it went through is how you get a follow-up phone call.
 */

import { useState, useTransition } from "react";
import { CalendarCheck, Check, Loader2 } from "lucide-react";
import { submitAvailability } from "@/lib/actions/availability-requests";
import {
  GRID_DAYS,
  GRID_PERIODS,
  GRID_TIMEZONE_LABEL,
  type GridSlot,
} from "@/lib/scheduling/availability-grid";

export function AvailabilityGridForm({
  token,
  contactName,
}: {
  token: string;
  contactName: string | null;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [complicated, setComplicated] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(day: string, period: string) {
    const key = `${day}:${period}`;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function submit() {
    setError(null);
    const slots: GridSlot[] = Array.from(picked).map((k) => {
      const [day, period] = k.split(":");
      return { day, period } as GridSlot;
    });
    startTransition(async () => {
      const r = await submitAvailability({
        token,
        slots,
        note: complicated ? note : undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="border border-tbb-line rounded-lg bg-white p-8 text-center space-y-3">
        <Check className="w-10 h-10 mx-auto text-tbb-success" aria-hidden />
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          Got it — thank you
        </h2>
        <p className="font-sans text-sm text-tbb-ink-2 max-w-md mx-auto">
          Your availability has been sent to your Business Builder. They&apos;ll
          come back to you with proposed times. Nothing else to do.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-4">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Tick every window that works
          </p>
          <p className="font-sans text-xs text-tbb-ink-3">
            All times {GRID_TIMEZONE_LABEL}. Sessions run two hours, twice a
            month — the more windows you can offer, the easier it is to find a
            slot that sticks.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th className="text-left py-2 pr-3" />
                {GRID_PERIODS.map((p) => (
                  <th key={p.key} className="text-left py-2 px-3">
                    <span className="block font-bold text-sm text-foreground">
                      {p.label}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {p.hours}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRID_DAYS.map((d) => (
                <tr key={d.key} className="border-t border-tbb-line-soft">
                  <th className="text-left py-2 pr-3 font-sans text-sm font-bold text-foreground">
                    {d.label}
                  </th>
                  {GRID_PERIODS.map((p) => {
                    const key = `${d.key}:${p.key}`;
                    const on = picked.has(key);
                    return (
                      <td key={p.key} className="py-2 px-3">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(d.key, p.key)}
                            disabled={isPending}
                            aria-label={`${d.label} ${p.label}`}
                          />
                          <span className="font-sans text-sm text-tbb-ink-2">
                            {on ? "Works" : "—"}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-tbb-line rounded-lg bg-white p-5 space-y-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={complicated}
            onChange={(e) => setComplicated(e.target.checked)}
            disabled={isPending}
            className="mt-1"
          />
          <span className="font-sans text-sm text-foreground">
            It&apos;s complicated — I&apos;ll give you more detail
          </span>
        </label>
        {complicated && (
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending}
            placeholder="Tell us how your weeks actually run — shift patterns, travel, busy season, whatever matters."
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
          />
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <CalendarCheck className="w-4 h-4" aria-hidden />
        )}
        {isPending ? "Sending…" : "Send my availability"}
      </button>
      {contactName && (
        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-4">
          Submitting as {contactName}
        </p>
      )}
    </div>
  );
}
