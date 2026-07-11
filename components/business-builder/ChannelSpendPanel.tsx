"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import {
  upsertChannelSpend,
  type ChannelSpendRow,
} from "@/lib/actions/channel-spend";
import {
  LEAD_SOURCE_CHANNELS,
  LEAD_SOURCE_LABELS,
  PAID_CHANNELS,
  type LeadSourceChannel,
} from "@/lib/pipeline/lead-source";
import { formatCad } from "@/lib/format";

/** Default the month picker to the current month ("YYYY-MM"). */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function ChannelSpendPanel({
  initialRows,
}: {
  initialRows: ChannelSpendRow[];
}) {
  const router = useRouter();
  // Lead with the paid channels — those are the ones a spend figure means
  // something for — then the rest.
  const orderedChannels: LeadSourceChannel[] = [
    ...PAID_CHANNELS,
    ...LEAD_SOURCE_CHANNELS.filter((c) => !PAID_CHANNELS.includes(c)),
  ];

  const [channel, setChannel] = useState<LeadSourceChannel>(
    PAID_CHANNELS[0] ?? "other",
  );
  const [month, setMonth] = useState(currentMonth());
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const trimmed = amount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      setError("Enter the spend as a dollar amount, e.g. 1200 or 1200.50.");
      return;
    }
    const amountCents = Math.round(parseFloat(trimmed) * 100);
    startTransition(async () => {
      const r = await upsertChannelSpend({ channel, month, amountCents });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setAmount("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="border border-tbb-line rounded-lg bg-white p-6 shadow-tbb-sm space-y-4">
        <h2 className="font-bold text-tbb-navy text-lg">Add or update spend</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className={labelCls}>Channel</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as LeadSourceChannel)}
              disabled={pending}
              className={inputCls}
            >
              {orderedChannels.map((c) => (
                <option key={c} value={c}>
                  {LEAD_SOURCE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelCls}>Month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={pending}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelCls}>Spend (CAD)</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1200"
              disabled={pending}
              className={inputCls}
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="w-4 h-4" aria-hidden />
            )}
            {pending ? "Saving…" : "Save spend"}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-tbb-success">
              <Check className="w-4 h-4" aria-hidden /> Saved.
            </span>
          )}
          {error && <span className="text-sm text-tbb-danger">{error}</span>}
        </div>
        <p className="text-[11px] text-tbb-ink-3">
          Saving the same channel + month again overwrites the previous
          figure — there&apos;s one number per channel per month.
        </p>
      </section>

      <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
        <header className="px-5 py-3 border-b border-tbb-line-soft">
          <h2 className="font-bold text-tbb-navy">Spend on file</h2>
        </header>
        {initialRows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-tbb-ink-3 italic">
            No spend entered yet. Add your first month above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 border-b border-tbb-line-soft">
                  <th className="px-5 py-2.5">Month</th>
                  <th className="px-5 py-2.5">Channel</th>
                  <th className="px-5 py-2.5 text-right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {initialRows.map((r) => (
                  <tr
                    key={`${r.channel}-${r.month}`}
                    className="border-b border-tbb-line-soft last:border-0 text-foreground"
                  >
                    <td className="px-5 py-2.5 tabular-nums">{r.month}</td>
                    <td className="px-5 py-2.5">
                      {LEAD_SOURCE_LABELS[r.channel]}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {formatCad(r.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue";
const labelCls =
  "text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3";
