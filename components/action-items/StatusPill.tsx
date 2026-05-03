"use client";

/**
 * StatusPill — fast-path status update.
 *
 * Click → native select dropdown → pick new status → server action call.
 * No client-side optimistic update for Phase 1.2; the page re-renders
 * with the new state via revalidatePath in the server action. Saves us
 * an optimistic-update edge case at the cost of a brief network
 * round-trip on click.
 */

import { useTransition } from "react";
import { updateActionItem } from "@/lib/actions/action-items";
import {
  STATUS_LABEL,
  type ActionItemStatus,
} from "./utils";

const STATUS_CLASSES: Record<ActionItemStatus, string> = {
  draft:
    "bg-[#CCCCCC] text-[#1A1A1A]",
  open:
    "bg-[#2E4057] text-[#F5F1E8]",
  in_progress:
    "bg-[#1A1A1A] text-[#F5F1E8]",
  done:
    "bg-[#666666] text-[#F5F1E8]",
  blocked:
    "bg-[#E87722] text-[#1A1A1A]",
};

export function StatusPill({
  itemId,
  status,
  options,
  disabled,
}: {
  itemId: string;
  status: ActionItemStatus;
  options: readonly ActionItemStatus[];
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative inline-block">
      <select
        aria-label="Status"
        value={status}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value as ActionItemStatus;
          startTransition(async () => {
            await updateActionItem(itemId, { status: next });
          });
        }}
        className={
          "appearance-none cursor-pointer font-mono text-[10px] uppercase tracking-[0.15em] " +
          "px-3 py-1 rounded-full border-0 outline-none focus-visible:ring-2 focus-visible:ring-[#2E4057] " +
          "disabled:opacity-60 disabled:cursor-not-allowed " +
          STATUS_CLASSES[status]
        }
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
