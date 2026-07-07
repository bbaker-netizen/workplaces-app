"use client";

/**
 * Client wrapper for the action items list. Manages filter state and
 * renders the filtered cards. Sort is done server-side; this component
 * only filters.
 *
 * When `groupByDueDate` is set (the coach "My work" view), the filtered
 * items are grouped into collapsible urgency drawers — Overdue / Due today
 * / This week / Later / No due date / Done — with Overdue open by default
 * and the rest closed. Buckets are computed with Luxon from a server-passed
 * `nowMs` in Mountain Time, so server and client agree (no hydration drift).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { ActionItemCard, type ActionItemCardData } from "./ActionItemCard";
import { FilterChips, type FilterValue } from "./FilterChips";
import { CollapsibleSection } from "@/components/pipeline/CollapsibleSection";
import type { ActionItemStatus } from "./utils";

export type ActionItemListItem = ActionItemCardData & {
  // Pre-computed by the server: where to navigate for detail/edit.
  detailHref: string;
};

const ZONE = "America/Edmonton";

type BucketKey = "overdue" | "today" | "week" | "later" | "none" | "done";

const BUCKETS: { key: BucketKey; label: string; defaultOpen?: boolean }[] = [
  { key: "overdue", label: "Overdue", defaultOpen: true },
  { key: "today", label: "Due today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No due date" },
  { key: "done", label: "Done" },
];

export function ActionItemListClient({
  items,
  statusOptions,
  newItemHref,
  emptyHeadline,
  emptyDescription,
  pillDisabledForRoles = false,
  groupByDueDate = false,
  nowMs,
}: {
  items: ActionItemListItem[];
  statusOptions: readonly ActionItemStatus[];
  newItemHref: string | null;
  emptyHeadline: string;
  emptyDescription: string;
  pillDisabledForRoles?: boolean;
  /** Group the list into collapsible urgency drawers (coach My work view). */
  groupByDueDate?: boolean;
  /** Server-rendered `Date.now()` — keeps day-bucketing deterministic. */
  nowMs?: number;
}) {
  const [active, setActive] = useState<FilterValue>("all");

  const counts = useMemo(() => {
    const out: Record<FilterValue, number> = {
      all: items.length,
      draft: 0,
      open: 0,
      in_progress: 0,
      done: 0,
      blocked: 0,
    };
    for (const it of items) out[it.status]++;
    return out;
  }, [items]);

  const visible = useMemo(
    () =>
      active === "all" ? items : items.filter((it) => it.status === active),
    [items, active],
  );

  // Group the filtered set into urgency buckets, preserving the server sort.
  const grouped = useMemo(() => {
    if (!groupByDueDate) return null;
    const now = DateTime.fromMillis(nowMs ?? Date.now(), { zone: ZONE });
    const todayStart = now.startOf("day");
    const todayEnd = now.endOf("day");
    const weekEnd = todayStart.plus({ days: 7 }).endOf("day");

    const bucketOf = (it: ActionItemListItem): BucketKey => {
      if (it.status === "done") return "done";
      if (!it.dueDate) return "none";
      const d = DateTime.fromJSDate(new Date(it.dueDate), { zone: ZONE });
      if (d < todayStart) return "overdue";
      if (d <= todayEnd) return "today";
      if (d <= weekEnd) return "week";
      return "later";
    };

    const map = new Map<BucketKey, ActionItemListItem[]>();
    for (const it of visible) {
      const b = bucketOf(it);
      const arr = map.get(b);
      if (arr) arr.push(it);
      else map.set(b, [it]);
    }
    return map;
  }, [groupByDueDate, nowMs, visible]);

  const list = (rows: ActionItemListItem[]) => (
    <ul className="space-y-3 sm:space-y-4">
      {rows.map((item) => (
        <li key={item.id}>
          <ActionItemCard
            item={item}
            detailHref={item.detailHref}
            statusOptions={statusOptions}
            pillDisabled={pillDisabledForRoles}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <FilterChips
          options={statusOptions}
          active={active}
          counts={counts}
          onChange={setActive}
        />
        {newItemHref && (
          <Link
            href={newItemHref}
            className="inline-flex items-center justify-center font-sans text-sm font-bold tracking-wider uppercase bg-tbb-blue-700 text-white hover:bg-tbb-blue transition-colors px-5 py-2.5 rounded-pill"
          >
            + New action item
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-tbb-line bg-white px-6 py-12 text-center">
          <p className="font-bold text-foreground text-2xl tracking-tight">
            {emptyHeadline}
          </p>
          <p className="mt-2 font-sans text-sm text-muted-foreground max-w-md mx-auto">
            {emptyDescription}
          </p>
        </div>
      ) : grouped ? (
        <div className="space-y-3">
          {BUCKETS.map(({ key, label, defaultOpen }) => {
            const rows = grouped.get(key);
            if (!rows || rows.length === 0) return null;
            return (
              <CollapsibleSection
                key={key}
                title={label}
                storageKey={`mywork-${key}`}
                defaultOpen={defaultOpen}
                badge={rows.length}
              >
                <div className="p-4">{list(rows)}</div>
              </CollapsibleSection>
            );
          })}
        </div>
      ) : (
        list(visible)
      )}
    </div>
  );
}
