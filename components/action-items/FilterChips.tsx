"use client";

/**
 * FilterChips — single-select filter row above the action items list.
 *
 * Phase 1.2: a chip per status the current user can see, plus an "All"
 * chip. Counts shown in parentheses. Active chip uses Steel Blue;
 * inactive chips are subtle.
 */

import { STATUS_LABEL, type ActionItemStatus } from "./utils";

export type FilterValue = "all" | ActionItemStatus;

export function FilterChips({
  options,
  active,
  counts,
  onChange,
}: {
  options: readonly ActionItemStatus[];
  active: FilterValue;
  counts: Record<FilterValue, number>;
  onChange: (next: FilterValue) => void;
}) {
  const chips: Array<{ value: FilterValue; label: string }> = [
    { value: "all", label: "All" },
    ...options.map((s) => ({ value: s as FilterValue, label: STATUS_LABEL[s] })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isActive = chip.value === active;
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onChange(chip.value)}
            className={
              "font-mono text-[11px] uppercase tracking-tbb-caps px-3 py-1.5 rounded-full transition-colors " +
              (isActive
                ? "bg-tbb-blue-700 text-white"
                : "bg-white text-tbb-ink-3 border border-tbb-line hover:text-tbb-navy hover:border-tbb-ink-3")
            }
          >
            {chip.label}
            <span className={isActive ? "ml-2 opacity-80" : "ml-2 opacity-60"}>
              {counts[chip.value] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
