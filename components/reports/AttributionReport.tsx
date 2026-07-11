"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { formatCad } from "@/lib/format";
import type { AttributionReport as Report } from "@/lib/db/queries/attribution";

/**
 * Lead-source attribution table with a date-range filter. The report is
 * computed server-side; this component owns the date inputs and pushes the
 * chosen range into the URL (?from=&to=) so the server re-runs the query.
 */
export function AttributionReport({
  report,
  fromDate,
  toDate,
}: {
  report: Report;
  fromDate: string; // "YYYY-MM-DD"
  toDate: string; // "YYYY-MM-DD"
}) {
  const router = useRouter();
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);

  function apply(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams();
    params.set("from", nextFrom);
    params.set("to", nextTo);
    router.push(`/business-builder/reports?${params.toString()}`);
  }

  const money = (cents: number | null) =>
    cents === null ? "—" : formatCad(cents);

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
      <header className="px-5 py-3 border-b border-tbb-line-soft flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-tbb-navy">Lead source attribution</h2>
          <p className="text-[11px] text-tbb-ink-3 mt-0.5">
            What each channel costs to turn into booked sessions and clients
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value);
                apply(e.target.value, to);
              }}
              className="bg-white border border-tbb-line rounded-md px-2 py-1 text-xs font-sans normal-case tracking-normal text-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            To
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value);
                apply(from, e.target.value);
              }}
              className="bg-white border border-tbb-line rounded-md px-2 py-1 text-xs font-sans normal-case tracking-normal text-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </label>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 border-b border-tbb-line-soft">
              <th className="px-5 py-2.5">Channel</th>
              <th className="px-3 py-2.5 text-right">Spend</th>
              <th className="px-3 py-2.5 text-right">Leads</th>
              <th className="px-3 py-2.5 text-right">Booked</th>
              <th className="px-3 py-2.5 text-right">Clients</th>
              <th className="px-3 py-2.5 text-right">Cost / booked</th>
              <th className="px-5 py-2.5 text-right">Cost / client</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const dim =
                row.leads === 0 &&
                row.bookedSessions === 0 &&
                row.clients === 0 &&
                row.spendCents === null;
              return (
                <tr
                  key={row.channel}
                  className={
                    "border-b border-tbb-line-soft last:border-0 " +
                    (dim ? "text-tbb-ink-3" : "text-foreground")
                  }
                >
                  <td className="px-5 py-2.5 font-medium">{row.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(row.spendCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.leads}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.bookedSessions}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.clients}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(row.costPerBookedSessionCents)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {money(row.costPerClientCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold text-tbb-navy border-t-2 border-tbb-line">
              <td className="px-5 py-2.5">All channels</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatCad(report.totals.spendCents)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {report.totals.leads}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {report.totals.bookedSessions}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {report.totals.clients}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {report.totals.bookedSessions > 0
                  ? formatCad(
                      Math.round(
                        report.totals.spendCents /
                          report.totals.bookedSessions,
                      ),
                    )
                  : "—"}
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums">
                {report.totals.clients > 0
                  ? formatCad(
                      Math.round(
                        report.totals.spendCents / report.totals.clients,
                      ),
                    )
                  : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer className="px-5 py-3 border-t border-tbb-line-soft flex items-center justify-between gap-3">
        <p className="text-[11px] text-tbb-ink-3">
          A dash in a cost column means no spend is on file for that channel
          in this range. Leads, booked sessions, and clients are each counted
          by when they happened within the window.
        </p>
        <Link
          href="/business-builder/settings/channel-spend"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline whitespace-nowrap"
        >
          <Settings2 className="w-3 h-3" aria-hidden /> Enter spend
        </Link>
      </footer>
    </section>
  );
}
