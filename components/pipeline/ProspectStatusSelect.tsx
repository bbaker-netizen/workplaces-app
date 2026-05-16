"use client";

/**
 * Stage pill + inline editor for a prospect's pipeline status.
 *
 * The pill is colour-coded per the Monday-style stage palette. Clicking
 * it opens a native <select> overlay that the user can change inline;
 * the chip background updates immediately and the server action runs
 * in a transition.
 */

import { useTransition, useState } from "react";
import { Loader2 } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";
import {
  STAGE_STYLES,
  STAGE_ORDER,
  type ProspectStatus,
} from "@/lib/pipeline/stages";

export function ProspectStatusSelect({
  prospectId,
  current,
}: {
  prospectId: string;
  current: ProspectStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<ProspectStatus>(current);
  const style = STAGE_STYLES[value] ?? STAGE_STYLES.new_lead;

  function onChange(next: ProspectStatus) {
    setValue(next);
    startTransition(async () => {
      const r = await updateProspect({ id: prospectId, status: next });
      if (!r.ok) {
        // Revert on failure.
        setValue(current);
      }
    });
  }

  return (
    <span className="relative inline-flex items-center">
      <span
        className={
          "inline-flex items-center gap-1 px-3 py-1 rounded-pill text-[11px] font-bold uppercase tracking-tbb-caps " +
          style.chipClass
        }
      >
        {isPending && (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
        )}
        {style.label}
      </span>
      <select
        aria-label="Change stage"
        value={value}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value as ProspectStatus)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        {STAGE_ORDER.map((s) => (
          <option key={s} value={s}>
            {STAGE_STYLES[s].label}
          </option>
        ))}
      </select>
    </span>
  );
}
