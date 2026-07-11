/**
 * Lead-source attribution report — the numbers that settle which channels
 * actually pay. One row per acquisition channel over a date window:
 *
 *   Channel | Spend | Leads | Booked sessions | Clients
 *           | Cost per booked session | Cost per client
 *
 * Each count is filtered by its OWN attribution timestamp within the
 * window (a lead first seen in the window, a session booked in the
 * window, a client won in the window) — standard period reporting, so a
 * lead in one month and their booking in the next land in the right
 * buckets. Spend is the hand-entered channel_spend summed over the
 * window's months.
 *
 * Cost columns show null (rendered as a dash) when there's no spend for
 * that channel — we never divide by a spend we don't have.
 *
 * Business Builder side only, master org. Small volume: pull + aggregate
 * in JS, matching lib/db/queries/reports.ts.
 */

import { and, eq, gte, lte } from "drizzle-orm";
import { channelSpend, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  LEAD_SOURCE_CHANNELS,
  LEAD_SOURCE_LABELS,
  type LeadSourceChannel,
} from "@/lib/pipeline/lead-source";

export type AttributionRow = {
  channel: LeadSourceChannel;
  label: string;
  spendCents: number | null;
  leads: number;
  bookedSessions: number;
  clients: number;
  /** Null when there's no spend or no bookings — rendered as a dash. */
  costPerBookedSessionCents: number | null;
  /** Null when there's no spend or no clients — rendered as a dash. */
  costPerClientCents: number | null;
};

export type AttributionReport = {
  fromISO: string;
  toISO: string;
  rows: AttributionRow[];
  totals: {
    spendCents: number;
    leads: number;
    bookedSessions: number;
    clients: number;
  };
};

function inWindow(d: Date | null, from: Date, to: Date): boolean {
  if (!d) return false;
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export async function getAttributionReport(
  from: Date,
  to: Date,
): Promise<AttributionReport> {
  const { rows, spend } = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return { rows: [], spend: [] };

    const prospectRows = await tx
      .select({
        source: prospects.source,
        firstSeenAt: prospects.firstSeenAt,
        bookedSessionAt: prospects.bookedSessionAt,
        becameClientAt: prospects.becameClientAt,
      })
      .from(prospects)
      .where(eq(prospects.orgId, master.id));

    // Spend is stored per month (first-of-month date). Include any month
    // that falls within the window (compare against the window's start
    // month so a partial first month still counts).
    const fromMonth = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
    );
    const spendRows = await tx
      .select({
        channel: channelSpend.channel,
        amountCents: channelSpend.amountCents,
        month: channelSpend.month,
      })
      .from(channelSpend)
      .where(
        and(
          eq(channelSpend.orgId, master.id),
          gte(channelSpend.month, fromMonth.toISOString().slice(0, 10)),
          lte(channelSpend.month, to.toISOString().slice(0, 10)),
        ),
      );

    return { rows: prospectRows, spend: spendRows };
  });

  // Seed a bucket per channel so every channel shows, even at zero.
  const buckets = new Map<
    LeadSourceChannel,
    { spendCents: number; leads: number; booked: number; clients: number }
  >();
  for (const c of LEAD_SOURCE_CHANNELS) {
    buckets.set(c, { spendCents: 0, leads: 0, booked: 0, clients: 0 });
  }

  for (const r of rows) {
    const b = buckets.get(r.source as LeadSourceChannel);
    if (!b) continue;
    if (inWindow(r.firstSeenAt, from, to)) b.leads += 1;
    if (inWindow(r.bookedSessionAt, from, to)) b.booked += 1;
    if (inWindow(r.becameClientAt, from, to)) b.clients += 1;
  }

  // Track which channels actually have a spend row in the window — a $0
  // entry is still "we spent, and it was zero", distinct from no data.
  const spentChannels = new Set<LeadSourceChannel>();
  for (const s of spend) {
    const ch = s.channel as LeadSourceChannel;
    const b = buckets.get(ch);
    if (!b) continue;
    b.spendCents += s.amountCents;
    spentChannels.add(ch);
  }

  const rowsOut: AttributionRow[] = LEAD_SOURCE_CHANNELS.map((channel) => {
    const b = buckets.get(channel)!;
    const hasSpend = spentChannels.has(channel);
    const spendCents = hasSpend ? b.spendCents : null;
    return {
      channel,
      label: LEAD_SOURCE_LABELS[channel],
      spendCents,
      leads: b.leads,
      bookedSessions: b.booked,
      clients: b.clients,
      costPerBookedSessionCents:
        spendCents !== null && b.booked > 0
          ? Math.round(spendCents / b.booked)
          : null,
      costPerClientCents:
        spendCents !== null && b.clients > 0
          ? Math.round(spendCents / b.clients)
          : null,
    };
  });

  const totals = rowsOut.reduce(
    (acc, r) => ({
      spendCents: acc.spendCents + (r.spendCents ?? 0),
      leads: acc.leads + r.leads,
      bookedSessions: acc.bookedSessions + r.bookedSessions,
      clients: acc.clients + r.clients,
    }),
    { spendCents: 0, leads: 0, bookedSessions: 0, clients: 0 },
  );

  return {
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
    rows: rowsOut,
    totals,
  };
}
