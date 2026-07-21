"use client";

/**
 * NewSeriesForm — define a recurring internal meeting.
 *
 * Collapsed to a single button until opened; the Team page's primary
 * job is showing the next meeting, not this form.
 *
 * The datetime-local value is interpreted as Mountain Time and
 * converted to a UTC ISO string client-side via the shared session
 * helpers, so the server never has to guess a timezone.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { createSessionSeries } from "@/lib/actions/session-series";
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from "@/components/sessions/utils";

/** Next Tuesday at 9:00 AM MT — a sensible default touch-base slot. */
function defaultAnchor(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
  d.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(d);
}

export function NewSeriesForm({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("Touch base");
  const [cadence, setCadence] = useState<"weekly" | "biweekly" | "monthly">(
    "weekly",
  );
  const [type, setType] = useState<"virtual" | "in_person">("virtual");
  const [anchorLocal, setAnchorLocal] = useState(defaultAnchor);
  const [durationMin, setDurationMin] = useState(60);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createSessionSeries({
        engagementId,
        title: title.trim(),
        type,
        cadence,
        anchorAt: fromDateTimeLocalValue(anchorLocal).toISOString(),
        durationMin,
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-tbb-line bg-white px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
      >
        <CalendarPlus className="w-3.5 h-3.5" aria-hidden />
        New recurring meeting
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-tbb-line bg-white p-4 space-y-3 shadow-tbb-xs"
    >
      <h3 className="font-bold text-tbb-navy tracking-tight">
        New recurring meeting
      </h3>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-tbb-orange/10 border border-tbb-orange/30 px-3 py-2 font-sans text-sm text-tbb-orange"
        >
          {error}
        </p>
      )}

      <label className="block space-y-1">
        <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
          Name
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          className="w-full rounded-lg border border-tbb-line px-3 py-2 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
            First meeting (Mountain Time)
          </span>
          <input
            type="datetime-local"
            value={anchorLocal}
            onChange={(e) => setAnchorLocal(e.target.value)}
            required
            className="w-full rounded-lg border border-tbb-line px-3 py-2 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
            Repeats
          </span>
          <select
            value={cadence}
            onChange={(e) =>
              setCadence(e.target.value as "weekly" | "biweekly" | "monthly")
            }
            className="w-full rounded-lg border border-tbb-line bg-white px-3 py-2 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
          >
            <option value="weekly">Every week</option>
            <option value="biweekly">Every two weeks</option>
            <option value="monthly">Every month</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
            Format
          </span>
          <select
            value={type}
            onChange={(e) =>
              setType(e.target.value as "virtual" | "in_person")
            }
            className="w-full rounded-lg border border-tbb-line bg-white px-3 py-2 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
          >
            <option value="virtual">Virtual</option>
            <option value="in_person">In person</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
            Length (minutes)
          </span>
          <input
            type="number"
            min={5}
            max={600}
            step={5}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="w-full rounded-lg border border-tbb-line px-3 py-2 font-sans text-sm text-tbb-navy focus:border-tbb-blue focus:outline-none"
          />
        </label>
      </div>

      <p className="font-sans text-xs text-muted-foreground">
        The first three months of meetings are created right away, and the
        schedule tops itself up from there.
      </p>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-tbb-navy px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-white hover:bg-tbb-blue disabled:opacity-50 transition-colors"
        >
          {pending && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          )}
          Create schedule
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-tbb-line px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
