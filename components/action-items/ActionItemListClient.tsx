"use client";

/**
 * Client wrapper for the action items list. Manages filter state and
 * renders the filtered cards. Sort is done server-side; this component
 * only filters.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ActionItemCard, type ActionItemCardData } from "./ActionItemCard";
import { FilterChips, type FilterValue } from "./FilterChips";
import type { ActionItemStatus } from "./utils";

export type ActionItemListItem = ActionItemCardData & {
  // Pre-computed by the server: where to navigate for detail/edit.
  detailHref: string;
};

export function ActionItemListClient({
  items,
  statusOptions,
  newItemHref,
  emptyHeadline,
  emptyDescription,
  pillDisabledForRoles = false,
}: {
  items: ActionItemListItem[];
  statusOptions: readonly ActionItemStatus[];
  newItemHref: string | null;
  emptyHeadline: string;
  emptyDescription: string;
  pillDisabledForRoles?: boolean;
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
            className="inline-flex items-center justify-center font-sans text-sm font-bold tracking-wider uppercase bg-[#2E4057] text-[#F5F1E8] hover:bg-[#1A1A1A] transition-colors px-5 py-2.5 rounded-md"
          >
            + New action item
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-[#CCCCCC] bg-white px-6 py-12 text-center">
          <p className="font-display font-bold text-foreground text-2xl tracking-tight">
            {emptyHeadline}
          </p>
          <p className="mt-2 font-sans text-sm text-muted-foreground max-w-md mx-auto">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <ul className="space-y-3 sm:space-y-4">
          {visible.map((item) => (
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
      )}
    </div>
  );
}
