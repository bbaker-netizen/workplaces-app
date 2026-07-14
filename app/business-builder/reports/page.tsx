import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getPipelineReport } from "@/lib/db/queries/reports";
import { getAttributionReport } from "@/lib/db/queries/attribution";
import { formatCad } from "@/lib/format";
import {
  ColumnChart,
  HBarList,
  StatCard,
} from "@/components/reports/Charts";
import { SalesFunnel } from "@/components/reports/SalesFunnel";
import { AttributionReport } from "@/components/reports/AttributionReport";

/** Parse a YYYY-MM-DD search param into a UTC Date, or null if malformed. */
function parseDateParam(v: string | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Business Builder reports dashboard — the pipeline at a glance.
 *
 * Running lead source, conversion rate, time to close, funnel shape, and
 * new leads over time. Read-only, server-rendered, Business Builder side
 * only. Numbers come from getPipelineReport (master org prospects).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const r = await getPipelineReport();

  // Attribution window: default to the trailing 12 months ending today.
  const todayUtc = new Date(`${isoDay(new Date())}T23:59:59.999Z`);
  const defaultFrom = new Date(
    Date.UTC(todayUtc.getUTCFullYear() - 1, todayUtc.getUTCMonth(), 1),
  );
  const from = parseDateParam(searchParams?.from) ?? defaultFrom;
  // Include the whole "to" day.
  const toParsed = parseDateParam(searchParams?.to);
  const to = toParsed
    ? new Date(`${isoDay(toParsed)}T23:59:59.999Z`)
    : todayUtc;
  const attribution = await getAttributionReport(from, to);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          Reports
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          How the pipeline is really performing — where leads come from, how
          many convert, and how long they take.
        </p>
      </header>

      {/* Headline numbers */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total leads"
          value={String(r.totalLeads)}
          hint={
            r.disqualifiedCount > 0
              ? `${r.qualifiedLeads} qualified · ${r.disqualifiedCount} disqualified`
              : "All qualified"
          }
        />
        <StatCard
          label="Active clients"
          value={String(r.activeClients)}
          hint={`${r.openCount} still open`}
        />
        <StatCard
          label="Conversion rate"
          value={`${r.conversionPct.toFixed(0)}%`}
          hint={`${r.activeClients} won · ${r.lostCount} lost · qualified only`}
          accent
        />
        <StatCard
          label="Median time to close"
          value={
            r.medianDaysToClose === null
              ? "—"
              : `${r.medianDaysToClose} days`
          }
          hint={
            r.avgDaysToClose === null
              ? "No closed deals yet"
              : `${r.avgDaysToClose}-day average`
          }
        />
      </section>

      {/* Lead source attribution — spend vs. booked sessions vs. clients */}
      <AttributionReport
        report={attribution}
        fromDate={isoDay(from)}
        toDate={isoDay(to)}
      />

      {/* Marketing Lead Quality — disqualified leads, kept out of the sales
          performance numbers and surfaced here as a channel-quality signal. */}
      <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
        <header className="px-5 py-3 border-b border-tbb-line-soft flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-tbb-navy">Marketing lead quality</h2>
            <p className="text-[11px] text-tbb-ink-3 mt-0.5">
              Leads you marked Not qualified — kept out of your conversion
              numbers, tracked here so you can see which channels send junk.
            </p>
          </div>
          <div className="text-right">
            <p className="font-display font-bold text-2xl text-tbb-navy leading-none">
              {r.disqualifiedRatePct.toFixed(0)}%
            </p>
            <p className="text-[11px] text-tbb-ink-3 mt-0.5">
              {r.disqualifiedCount} of {r.totalLeads} disqualified
            </p>
          </div>
        </header>
        {r.disqualifiedCount === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-tbb-ink-3 italic">
            No disqualified leads yet. When you mark a lead Not qualified,
            it shows up here by channel and reason.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-tbb-line-soft">
            <div className="px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mb-3">
                By channel
              </p>
              <HBarList
                rows={r.disqualifiedBySource.map((s) => ({
                  label: s.source,
                  value: s.count,
                  sub: `${s.ratePct.toFixed(0)}% of that channel's leads`,
                }))}
              />
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mb-3">
                By reason
              </p>
              <HBarList
                rows={r.disqualifiedByReason.map((s) => ({
                  label: s.label,
                  value: s.count,
                }))}
              />
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead source */}
        <ReportCard
          title="Lead source"
          subtitle="Where every lead came in — total, with wins in the label"
        >
          <HBarList
            rows={r.leadSources.map((s) => ({
              label: s.source,
              value: s.total,
              sub:
                s.won > 0
                  ? `${s.won} won (${s.conversionPct.toFixed(0)}%)`
                  : undefined,
            }))}
          />
        </ReportCard>

        {/* Sales pyramid — the condensed 3-tier funnel we teach */}
        <ReportCard
          title="Sales pyramid"
          subtitle="New Lead → Prospects → Won"
        >
          <SalesFunnel
            tiers={r.funnelTiers.map((t) => ({
              label: t.label,
              count: t.count,
            }))}
          />
        </ReportCard>

        {/* New leads over time */}
        <ReportCard
          title="New leads over time"
          subtitle="Fresh leads per month, trailing 12 months"
        >
          <ColumnChart
            rows={r.monthly.map((m) => ({ label: m.label, count: m.count }))}
          />
        </ReportCard>

        {/* Value */}
        <ReportCard
          title="Deal value"
          subtitle="Expected value in the open pipeline vs. won"
        >
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="rounded-lg border border-tbb-line bg-tbb-cream-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Open pipeline
              </p>
              <p className="mt-1 font-display font-bold text-2xl text-tbb-navy">
                {formatCad(r.totalPipelineValueCents)}
              </p>
            </div>
            <div className="rounded-lg border border-tbb-orange/40 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                Won
              </p>
              <p className="mt-1 font-display font-bold text-2xl text-tbb-orange">
                {formatCad(r.wonValueCents)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-tbb-ink-3">
            Expected value is what you entered on each deal — set it on a
            prospect&apos;s Deal card to sharpen this number.
          </p>
        </ReportCard>
      </div>
    </main>
  );
}

function ReportCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm flex flex-col">
      <header className="px-5 py-3 border-b border-tbb-line-soft">
        <h2 className="font-bold text-tbb-navy">{title}</h2>
        <p className="text-[11px] text-tbb-ink-3 mt-0.5">{subtitle}</p>
      </header>
      <div className="px-5 py-4 flex-1">{children}</div>
    </section>
  );
}
