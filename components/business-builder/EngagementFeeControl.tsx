"use client";

/**
 * Monthly fee for an engagement.
 *
 * The column has existed since migration 0035 but was only ever written
 * at engagement creation, from the originating lead — so a fee that
 * changed later, or was entered wrongly, was stuck. It now drives the
 * effective hourly rate in the Friday rollup, which makes correcting it
 * worth a control.
 *
 * Entered in dollars, stored in cents. Blank clears it, which drops the
 * engagement out of the rate calculation rather than reporting a rate
 * against a fee of zero.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setEngagementMonthlyFee } from "@/lib/actions/engagements";

export function EngagementFeeControl({
  engagementId,
  currentCents,
  compact = false,
}: {
  engagementId: string;
  currentCents: number | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    currentCents === null ? "" : String(Math.round(currentCents / 100)),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const trimmed = value.trim();
    let cents: number | null = null;
    if (trimmed.length > 0) {
      const dollars = Number(trimmed.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError("Enter a number, or leave blank to clear.");
        return;
      }
      cents = Math.round(dollars * 100);
    }
    start(async () => {
      const r = await setEngagementMonthlyFee(engagementId, cents);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      {!compact && (
        <label
          htmlFor={`fee-${engagementId}`}
          className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3"
        >
          Monthly fee
        </label>
      )}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-tbb-ink-3">
          $
        </span>
        <input
          id={`fee-${engagementId}`}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder="not set"
          disabled={isPending}
          title="Monthly fee for this client. Drives the effective hourly rate in the Friday rollup."
          className="w-28 bg-white border border-tbb-line rounded-pill pl-5 pr-3 py-1.5 text-xs font-bold text-tbb-navy focus:outline-none focus:ring-2 focus:ring-tbb-blue disabled:opacity-50"
        />
      </div>
      {isPending && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-tbb-ink-3" aria-hidden />
      )}
      {saved && <span className="text-[11px] text-tbb-success font-bold">✓</span>}
      {error && <span className="text-[11px] text-tbb-danger">{error}</span>}
    </div>
  );
}
