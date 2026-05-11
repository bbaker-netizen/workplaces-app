"use client";

/**
 * ScheduleSessionForm — schedule a new BBS session.
 *
 * Mountain Time is the canonical timezone (CLAUDE.md scheduling
 * constraint). The `<input type="datetime-local">` returns a string
 * with no timezone info; we interpret it as MT via Luxon and submit
 * a true UTC ISO string to the server action.
 */

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { scheduleSession } from "@/lib/actions/bbs-sessions";
import { fromDateTimeLocalValue } from "./utils";

export function ScheduleSessionForm({
  engagementId,
  defaultLocalValue,
  onScheduled,
}: {
  engagementId: string;
  /** YYYY-MM-DDTHH:mm in Mountain Time. Defaults to "next Monday 9 AM MT" if omitted. */
  defaultLocalValue?: string;
  onScheduled?: (id: string) => void;
}) {
  const [scheduledAt, setScheduledAt] = useState(
    defaultLocalValue ?? defaultNextMondayMorning(),
  );
  const [type, setType] = useState<"in_person" | "virtual">("virtual");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    const utc = fromDateTimeLocalValue(scheduledAt);
    if (Number.isNaN(utc.getTime())) {
      setError("Pick a valid date and time.");
      return;
    }
    startTransition(async () => {
      const result = await scheduleSession({
        engagementId,
        scheduledAt: utc.toISOString(),
        type,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setNotes("");
        onScheduled?.(result.data.id);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border border-tbb-line rounded-md bg-white p-4 space-y-3"
      aria-busy={isPending}
    >
      <h2 className="font-bold text-foreground text-lg tracking-tight">
        Schedule a session
      </h2>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Date and time (Mountain Time)
          </span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            Format
          </span>
          <select
            value={type}
            onChange={(e) =>
              setType(e.target.value as "in_person" | "virtual")
            }
            disabled={isPending}
            className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue"
          >
            <option value="virtual">Virtual</option>
            <option value="in_person">In-person</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Notes (optional, markdown OK)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={isPending}
          placeholder="Agenda items, things to bring, links…"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {isPending && (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          )}
          {isPending ? "Scheduling…" : "Schedule"}
        </button>
      </div>
    </form>
  );
}

function defaultNextMondayMorning(): string {
  // YYYY-MM-DDTHH:mm interpreted as Mountain Time. We just construct
  // a best-guess locally; users can adjust before submitting.
  const today = new Date();
  const day = today.getDay(); // 0=Sun..6=Sat
  const daysUntilMonday = (8 - day) % 7 || 7;
  const target = new Date(today);
  target.setDate(today.getDate() + daysUntilMonday);
  target.setHours(9, 0, 0, 0);
  // Format YYYY-MM-DDTHH:mm using local time fields.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}
