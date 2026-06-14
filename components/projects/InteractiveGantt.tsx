"use client";

/**
 * InteractiveGantt — drag-to-reschedule timeline of an engagement's
 * projects.
 *
 *   • Drag a bar's body to move the whole project (shifts start + target).
 *   • Drag a bar's left/right edge to change the start / target date.
 *   • Drops persist via updateProject; optimistic, reverts on failure.
 *
 * Pixel-based layout (DAY_W px per day) keeps the drag math exact. The
 * whole grid scrolls horizontally for long timelines.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProject } from "@/lib/actions/projects";

const DAY_W = 20; // px per day
const ROW_H = 40;

export type GanttProject = {
  id: string;
  name: string;
  status: string;
  startISO: string | null;
  targetISO: string | null;
};

type Bar = { id: string; name: string; status: string; start: number; end: number };

const MS_DAY = 86_400_000;

function startOfDayMs(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isoFromDayOffset(rangeStartMs: number, dayOffset: number): string {
  const d = new Date(rangeStartMs + dayOffset * MS_DAY);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function InteractiveGantt({
  projects,
  rangeStartISO,
  totalDays,
}: {
  projects: GanttProject[];
  rangeStartISO: string;
  totalDays: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const rangeStartMs = startOfDayMs(rangeStartISO);

  // Seed bars from props. Projects missing a date get a default 14-day
  // span near "today" so they're still draggable/schedulable.
  const todayOffset = Math.round((Date.now() - rangeStartMs) / MS_DAY);
  const seed: Bar[] = projects.map((p) => {
    const start = p.startISO
      ? Math.round((startOfDayMs(p.startISO) - rangeStartMs) / MS_DAY)
      : todayOffset;
    const end = p.targetISO
      ? Math.round((startOfDayMs(p.targetISO) - rangeStartMs) / MS_DAY)
      : start + 14;
    return { id: p.id, name: p.name, status: p.status, start, end: Math.max(end, start) };
  });

  const [bars, setBars] = useState<Bar[]>(seed);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "l" | "r";
    startX: number;
    start0: number;
    end0: number;
  } | null>(null);

  function onPointerDown(
    e: React.PointerEvent,
    id: string,
    mode: "move" | "l" | "r",
  ) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const bar = bars.find((b) => b.id === id);
    if (!bar) return;
    dragRef.current = {
      id,
      mode,
      startX: e.clientX,
      start0: bar.start,
      end0: bar.end,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaDays = Math.round((e.clientX - drag.startX) / DAY_W);
    setBars((prev) =>
      prev.map((b) => {
        if (b.id !== drag.id) return b;
        if (drag.mode === "move") {
          return { ...b, start: drag.start0 + deltaDays, end: drag.end0 + deltaDays };
        }
        if (drag.mode === "l") {
          return { ...b, start: Math.min(drag.start0 + deltaDays, b.end) };
        }
        return { ...b, end: Math.max(drag.end0 + deltaDays, b.start) };
      }),
    );
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const bar = bars.find((b) => b.id === drag.id);
    if (!bar) return;
    if (bar.start === drag.start0 && bar.end === drag.end0) return; // no change
    setError(null);
    startTransition(async () => {
      const r = await updateProject(drag.id, {
        startDate: isoFromDayOffset(rangeStartMs, bar.start),
        targetDate: isoFromDayOffset(rangeStartMs, bar.end),
      });
      if (!r.ok) {
        setError(r.error);
        // Revert.
        setBars((prev) =>
          prev.map((b) =>
            b.id === drag.id ? { ...b, start: drag.start0, end: drag.end0 } : b,
          ),
        );
      } else {
        router.refresh();
      }
    });
  }

  const gridW = totalDays * DAY_W;

  // Month header ticks.
  const months: { label: string; left: number }[] = [];
  const cursor = new Date(rangeStartMs);
  cursor.setDate(1);
  while (cursor.getTime() < rangeStartMs + totalDays * MS_DAY) {
    const offsetDays = Math.round((cursor.getTime() - rangeStartMs) / MS_DAY);
    if (offsetDays >= 0) {
      months.push({
        label: cursor.toLocaleString("en-CA", { month: "short", year: "2-digit" }),
        left: offsetDays * DAY_W,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const todayLeft = todayOffset * DAY_W;

  return (
    <div className="space-y-2">
      <p className="text-xs text-tbb-ink-3">
        Drag a bar to move it; drag an edge to change the start or target date.
      </p>
      {error && <p className="text-xs text-tbb-danger">{error}</p>}
      <div className="overflow-x-auto border border-tbb-line rounded-lg bg-white">
        <div style={{ width: gridW, minWidth: "100%" }}>
          {/* Month header */}
          <div
            className="relative h-7 border-b border-tbb-line-soft bg-tbb-cream-50"
            style={{ width: gridW }}
          >
            {months.map((m) => (
              <span
                key={m.label + m.left}
                className="absolute top-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 border-l border-tbb-line-soft pl-1"
                style={{ left: m.left }}
              >
                {m.label}
              </span>
            ))}
          </div>
          {/* Rows */}
          <div className="relative" style={{ width: gridW }}>
            {/* Today line */}
            {todayLeft >= 0 && todayLeft <= gridW && (
              <div
                className="absolute top-0 bottom-0 w-px bg-tbb-orange/70 z-10"
                style={{ left: todayLeft }}
                aria-hidden
              />
            )}
            {bars.length === 0 && (
              <p className="px-4 py-6 text-sm text-tbb-ink-3 italic">
                No projects to chart yet.
              </p>
            )}
            {bars.map((b, i) => {
              const left = b.start * DAY_W;
              const width = Math.max((b.end - b.start + 1) * DAY_W, DAY_W);
              const done = b.status === "completed" || b.status === "closed";
              return (
                <div
                  key={b.id}
                  className="relative border-b border-tbb-line-soft"
                  style={{ height: ROW_H }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  <div
                    className={
                      "absolute top-1.5 rounded-md text-white text-[11px] font-bold flex items-center select-none touch-none cursor-grab active:cursor-grabbing shadow-tbb-sm " +
                      (done ? "bg-tbb-success" : "bg-tbb-blue")
                    }
                    style={{ left, width, height: ROW_H - 12 }}
                    onPointerDown={(e) => onPointerDown(e, b.id, "move")}
                    title={`${b.name} — drag to move`}
                  >
                    {/* left handle */}
                    <span
                      onPointerDown={(e) => onPointerDown(e, b.id, "l")}
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md hover:bg-black/20"
                      aria-hidden
                    />
                    <span className="px-3 truncate pointer-events-none">
                      {b.name}
                    </span>
                    {/* right handle */}
                    <span
                      onPointerDown={(e) => onPointerDown(e, b.id, "r")}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md hover:bg-black/20"
                      aria-hidden
                    />
                  </div>
                  <span className="sr-only">{`Row ${i + 1}: ${b.name}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
