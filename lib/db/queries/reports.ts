/**
 * Pipeline reporting — the numbers behind the Business Builder reports
 * dashboard. Everything is computed from the `prospects` table in the
 * master org. Volume is small (hundreds of leads), so we pull the rows
 * we need once and aggregate in JS rather than firing a dozen group-by
 * queries.
 *
 * Business Builder side only — never surfaced to clients.
 */

import { eq } from "drizzle-orm";
import { orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  STAGE_ORDER,
  STAGE_STYLES,
  disqualificationReasonLabel,
  type ProspectStatus,
} from "@/lib/pipeline/stages";

const WON: ProspectStatus[] = ["onboarded"];
// "Lost" = a genuine sales loss on a QUALIFIED lead. Disqualified junk
// ("not_qualified") is deliberately NOT here — it's a marketing lead-quality
// signal, tracked separately so it never drags down the conversion rate.
const LOST: ProspectStatus[] = ["lost"];
const DISQUALIFIED: ProspectStatus[] = ["not_qualified"];
// Open pipeline stages, in funnel order (excludes terminal states).
const FUNNEL_STAGES: ProspectStatus[] = STAGE_ORDER.filter(
  (s) =>
    !WON.includes(s) && !LOST.includes(s) && !DISQUALIFIED.includes(s),
);

export type LeadSourceStat = {
  source: string;
  total: number;
  won: number;
  /** Won / qualified leads from this source (disqualified excluded), so a
   *  junk-heavy channel isn't penalised on conversion — its junk shows up in
   *  the Marketing Lead Quality breakdown instead. */
  conversionPct: number;
  /** How many leads from this source were disqualified. */
  disqualified: number;
};

/** Disqualified-lead breakdown for the Marketing Lead Quality section. */
export type DisqualifiedSourceStat = {
  source: string;
  count: number;
  /** Disqualified as a % of ALL leads from this source. */
  ratePct: number;
};

export type DisqualifiedReasonStat = {
  reason: string;
  label: string;
  count: number;
};

export type FunnelStat = {
  status: ProspectStatus;
  label: string;
  count: number;
};

/** Condensed 3-tier funnel/pyramid the methodology teaches. */
export type FunnelTier = {
  label: string;
  count: number;
};

// Which pipeline statuses roll up into each teaching tier. Legacy stages
// (diagnostic_*, negotiation) map to their nearest current stage's tier.
const TIER_NEW_LEAD: ProspectStatus[] = [
  "new_lead",
  "contact_attempted",
  "first_contact",
  "diagnostic_pending",
  "diagnostic_complete",
];
const TIER_PROSPECTS: ProspectStatus[] = [
  "meeting_scheduled",
  "appt_completed_followup",
  "proposal_sent",
  "negotiation",
  "contract_sent",
];
const TIER_WON: ProspectStatus[] = ["contract_signed", "onboarded"];

export type MonthlyLeadStat = {
  month: string; // "2026-05"
  label: string; // "May"
  count: number;
};

export type PipelineReport = {
  totalLeads: number;
  /** Total leads minus disqualified — the denominator sales performance is
   *  actually measured against. */
  qualifiedLeads: number;
  activeClients: number;
  lostCount: number;
  /** Leads marked "Not qualified" — a marketing lead-quality signal, kept out
   *  of the conversion / funnel / time-to-close numbers. */
  disqualifiedCount: number;
  /** Disqualified as a % of all leads. */
  disqualifiedRatePct: number;
  disqualifiedBySource: DisqualifiedSourceStat[];
  disqualifiedByReason: DisqualifiedReasonStat[];
  openCount: number;
  /** Won / (qualified leads that reached a decision), as a percentage.
   *  Disqualified leads are excluded from the denominator. */
  conversionPct: number;
  /** Median days from lead created → contract signed. Null if none yet. */
  medianDaysToClose: number | null;
  avgDaysToClose: number | null;
  leadSources: LeadSourceStat[];
  funnel: FunnelStat[];
  funnelTiers: FunnelTier[];
  monthly: MonthlyLeadStat[];
  totalPipelineValueCents: number;
  wonValueCents: number;
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export async function getPipelineReport(): Promise<PipelineReport> {
  const rows = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];
    return tx
      .select({
        status: prospects.status,
        leadSource: prospects.leadSource,
        createdAt: prospects.createdAt,
        contractSignedAt: prospects.contractSignedAt,
        archivedAt: prospects.archivedAt,
        expectedValueCents: prospects.expectedValueCents,
        monthlyFeeCents: prospects.monthlyFeeCents,
        disqualifiedReason: prospects.disqualifiedReason,
      })
      .from(prospects)
      .where(eq(prospects.orgId, master.id));
  });

  const isWon = (s: string) => WON.includes(s as ProspectStatus);
  const isLost = (s: string) => LOST.includes(s as ProspectStatus);
  const isDisqualified = (s: string) =>
    DISQUALIFIED.includes(s as ProspectStatus);

  const totalLeads = rows.length;
  const activeClients = rows.filter((r) => isWon(r.status)).length;
  const lostCount = rows.filter((r) => isLost(r.status)).length;
  const disqualifiedCount = rows.filter((r) => isDisqualified(r.status)).length;
  const qualifiedLeads = totalLeads - disqualifiedCount;
  const disqualifiedRatePct =
    totalLeads > 0 ? (disqualifiedCount / totalLeads) * 100 : 0;
  const openCount = rows.filter(
    (r) =>
      !isWon(r.status) &&
      !isLost(r.status) &&
      !isDisqualified(r.status) &&
      !r.archivedAt,
  ).length;

  // Conversion: won over qualified leads that reached a decision (won + lost).
  // Disqualified junk is excluded entirely — it's a marketing lead-quality
  // problem, not a sales-conversion one, so it never drags this number down.
  const decided = activeClients + lostCount;
  const conversionPct = decided > 0 ? (activeClients / decided) * 100 : 0;

  // Lead-source breakdown. `total` is raw volume (every lead from the source);
  // `disqualified` is the junk; conversion is measured on qualified only.
  const bySource = new Map<
    string,
    { total: number; won: number; disqualified: number }
  >();
  for (const r of rows) {
    const key = r.leadSource?.trim() || "Unknown";
    const cur = bySource.get(key) ?? { total: 0, won: 0, disqualified: 0 };
    cur.total += 1;
    if (isWon(r.status)) cur.won += 1;
    if (isDisqualified(r.status)) cur.disqualified += 1;
    bySource.set(key, cur);
  }
  const leadSources: LeadSourceStat[] = Array.from(bySource.entries())
    .map(([source, v]) => {
      const qualified = v.total - v.disqualified;
      return {
        source,
        total: v.total,
        won: v.won,
        conversionPct: qualified > 0 ? (v.won / qualified) * 100 : 0,
        disqualified: v.disqualified,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Marketing Lead Quality — which channels send junk, and why.
  const disqualifiedBySource: DisqualifiedSourceStat[] = Array.from(
    bySource.entries(),
  )
    .filter(([, v]) => v.disqualified > 0)
    .map(([source, v]) => ({
      source,
      count: v.disqualified,
      ratePct: v.total > 0 ? (v.disqualified / v.total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const byReason = new Map<string, number>();
  for (const r of rows) {
    if (!isDisqualified(r.status)) continue;
    const key = r.disqualifiedReason ?? "unspecified";
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const disqualifiedByReason: DisqualifiedReasonStat[] = Array.from(
    byReason.entries(),
  )
    .map(([reason, count]) => ({
      reason,
      label:
        reason === "unspecified"
          ? "No reason given"
          : disqualificationReasonLabel(reason),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Funnel — count of active (non-archived) prospects at each open stage,
  // plus won at the end so the "shape" reads left to right.
  const funnel: FunnelStat[] = FUNNEL_STAGES.map((status) => ({
    status,
    label: STAGE_STYLES[status]?.label ?? status,
    count: rows.filter((r) => r.status === status && !r.archivedAt).length,
  }));
  funnel.push({
    status: "onboarded",
    label: "Won",
    count: activeClients,
  });

  // Condensed 3-tier pyramid: New Lead → Prospects → Won. Counts every
  // non-archived prospect whose status rolls up into that tier.
  const tierCount = (statuses: ProspectStatus[]) =>
    rows.filter(
      (r) => !r.archivedAt && statuses.includes(r.status as ProspectStatus),
    ).length;
  const funnelTiers: FunnelTier[] = [
    { label: "New Lead", count: tierCount(TIER_NEW_LEAD) },
    { label: "Prospects", count: tierCount(TIER_PROSPECTS) },
    { label: "Won", count: tierCount(TIER_WON) },
  ];

  // Time to close — days from created to contract signed.
  const durations = rows
    .filter((r) => r.contractSignedAt)
    .map(
      (r) =>
        (r.contractSignedAt!.getTime() - r.createdAt.getTime()) /
        (1000 * 60 * 60 * 24),
    )
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const avgDaysToClose =
    durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : null;
  const medianDaysToClose =
    durations.length > 0
      ? Math.round(durations[Math.floor((durations.length - 1) / 2)])
      : null;

  // Monthly new leads — last 12 months, oldest → newest. Bucket by the
  // year-month of created_at. We derive the window from the newest row so
  // the chart is deterministic (no Date.now()-style call needed at read).
  const monthly = buildMonthly(rows.map((r) => r.createdAt));

  const totalPipelineValueCents = rows
    .filter((r) => !isWon(r.status) && !isLost(r.status) && !r.archivedAt)
    .reduce((s, r) => s + (r.expectedValueCents ?? 0), 0);
  const wonValueCents = rows
    .filter((r) => isWon(r.status))
    .reduce((s, r) => s + (r.expectedValueCents ?? 0), 0);

  return {
    totalLeads,
    qualifiedLeads,
    activeClients,
    lostCount,
    disqualifiedCount,
    disqualifiedRatePct,
    disqualifiedBySource,
    disqualifiedByReason,
    openCount,
    conversionPct,
    medianDaysToClose,
    avgDaysToClose,
    leadSources,
    funnel,
    funnelTiers,
    monthly,
    totalPipelineValueCents,
    wonValueCents,
  };
}

/** Bucket dates into the trailing 12 months ending at the latest date. */
function buildMonthly(dates: Date[]): MonthlyLeadStat[] {
  if (dates.length === 0) return [];
  const latest = dates.reduce((a, b) => (a > b ? a : b));
  const endY = latest.getUTCFullYear();
  const endM = latest.getUTCMonth();

  // 12 buckets ending at the latest month.
  const buckets: MonthlyLeadStat[] = [];
  const index = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    let y = endY;
    let m = endM - i;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    index.set(key, buckets.length);
    buckets.push({ month: key, label: MONTH_LABELS[m], count: 0 });
  }
  for (const d of dates) {
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const i = index.get(key);
    if (i !== undefined) buckets[i].count += 1;
  }
  return buckets;
}
