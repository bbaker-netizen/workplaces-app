"use client";

/**
 * Tiny popover that lets the coach edit a project's start + target
 * dates straight from the Gantt without leaving the page. Replaces
 * the "drag to resize" interaction with something that's actually
 * reliable on touch and accessible. Save calls updateProject and
 * router.refresh() repaints the chart.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Check, Loader2, X } from "lucide-react";
import { updateProject } from "@/lib/actions/projects";

function fmtInput(d: Date | null): string {
  if (!d) return "";
  // YYYY-MM-DD for <input type="date">.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function InlineProjectDateEdit({
  projectId,
  initialStart,
  initialTarget,
  triggerLabel,
}: {
  projectId: string;
  initialStart: Date | null;
  initialTarget: Date | null;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(fmtInput(initialStart));
  const [target, setTarget] = useState(fmtInput(initialTarget));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateProject(projectId, {
        startDate: start || null,
        targetDate: target || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
        title="Edit start + target dates"
      >
        <Calendar className="w-3 h-3" aria-hidden />
        {triggerLabel ?? "Edit dates"}
      </button>
      {open && (
        <div
          className="absolute z-20 top-full left-0 mt-1 w-64 bg-white border border-tbb-line rounded-md shadow-tbb-md p-3 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Resize timeline
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-tbb-ink-3 hover:text-tbb-navy"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Start
            </span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              disabled={isPending}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Target
            </span>
            <input
              type="date"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              disabled={isPending}
            />
          </label>
          {error && (
            <p className="text-xs text-tbb-danger bg-tbb-danger/10 px-2 py-1 rounded">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-1 rounded-pill text-tbb-ink-2 hover:bg-tbb-cream-50"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps px-2 py-1 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
              ) : (
                <Check className="w-3 h-3" aria-hidden />
              )}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
