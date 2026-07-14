"use client";

/**
 * Disqualify-reason picker — shown when a lead is moved to "Not qualified".
 *
 * Disqualified leads are a marketing lead-quality signal, so we capture WHY
 * here. The reason feeds Reports → Marketing Lead Quality (by reason + by
 * source). Confirm commits the stage change with the reason; cancel leaves the
 * stage where it was.
 *
 * Pre-selects the current reason when re-opening an already-disqualified lead,
 * so editing the reason is one click.
 */

import { useState } from "react";
import { X } from "lucide-react";
import {
  DISQUALIFICATION_REASONS,
  type DisqualificationReason,
} from "@/lib/pipeline/stages";

export function DisqualifyReasonModal({
  companyName,
  initialReason,
  onConfirm,
  onCancel,
}: {
  companyName: string;
  initialReason?: DisqualificationReason | null;
  onConfirm: (reason: DisqualificationReason) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<DisqualificationReason | null>(
    initialReason ?? null,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Disqualify lead"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        role="presentation"
        onClick={onCancel}
        className="absolute inset-0 bg-tbb-navy/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-md rounded-lg bg-white border border-tbb-line shadow-tbb-lg">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-tbb-line-soft">
          <div>
            <h2 className="font-bold text-tbb-navy">Mark as Not qualified</h2>
            <p className="text-[11px] text-tbb-ink-3 mt-0.5">
              Why is <span className="font-bold">{companyName}</span> a bad
              lead? This tracks marketing lead quality — it won&apos;t count
              against your conversion stats.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="text-tbb-ink-3 hover:text-tbb-navy shrink-0"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4 space-y-1.5">
          {DISQUALIFICATION_REASONS.map((r) => {
            const active = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                aria-pressed={active}
                className={
                  "w-full text-left px-3 py-2 rounded-md text-sm font-bold border transition-colors " +
                  (active
                    ? "bg-tbb-blue text-white border-tbb-blue"
                    : "bg-white text-tbb-navy border-tbb-line hover:bg-tbb-cream-50 hover:border-tbb-blue")
                }
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-tbb-line-soft">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-md text-sm font-bold text-tbb-ink-3 hover:text-tbb-navy"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason}
            onClick={() => reason && onConfirm(reason)}
            className="px-4 py-2 rounded-md text-sm font-bold uppercase tracking-tbb-caps bg-tbb-danger text-white hover:bg-tbb-danger/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Disqualify
          </button>
        </footer>
      </div>
    </div>
  );
}
