"use client";

/**
 * Set up the client's monthly retainer as a recurring invoice in QuickBooks.
 *
 * Two clicks, not one. This writes into the accounting file, and the button
 * sits beside ordinary editing controls — a stray click should not be able
 * to create a billing template. The confirm step also states the amount and
 * the day, so what gets created is read before it exists.
 *
 * What lands in QuickBooks is INACTIVE and unsent. Bruce reviews and
 * activates it there. Nothing here can bill a client.
 */

import { useState, useTransition } from "react";
import { Loader2, Repeat } from "lucide-react";
import { createRetainerRecurringInvoice } from "@/lib/actions/qbo-billing";

export function QboRecurringInvoiceButton({
  engagementId,
  monthlyFeeCents,
}: {
  engagementId: string;
  monthlyFeeCents: number | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);
  const [isPending, start] = useTransition();

  // Without a fee there is nothing to bill, and the action would refuse
  // anyway — better to say so before the click than after it.
  const fee =
    monthlyFeeCents && monthlyFeeCents > 0 ? monthlyFeeCents / 100 : null;

  function create() {
    setResult(null);
    start(async () => {
      const r = await createRetainerRecurringInvoice(engagementId);
      setResult(r.ok ? { ok: true } : { ok: false, error: r.error });
      setConfirming(false);
    });
  }

  if (result?.ok) {
    return (
      <span className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue">
        Created in QuickBooks — inactive
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span className="font-sans text-xs text-tbb-ink-2">
          {fee
            ? `Bill $${fee.toLocaleString()} monthly on the 1st?`
            : "Set a monthly fee first."}
        </span>
        {fee && (
          <button
            type="button"
            onClick={create}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
          >
            {isPending && (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            )}
            Create
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
        title="Create the monthly retainer as a recurring invoice in QuickBooks (inactive until you activate it there)"
      >
        <Repeat className="w-3.5 h-3.5" aria-hidden /> Recurring invoice
      </button>
      {result && !result.ok && (
        <span className="font-sans text-xs text-tbb-danger">
          {result.error}
        </span>
      )}
    </span>
  );
}
