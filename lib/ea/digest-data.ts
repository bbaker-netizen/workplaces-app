/**
 * Gathers everything the morning digest reports on.
 *
 * One pass, one transaction, `withSystemContext` throughout (see
 * lib/ea/recipients.ts for why a cron cannot use the session-bound
 * helpers). The result is a plain serialisable object: it is rendered
 * into the email AND persisted verbatim as `ea_digests.payload`, so what
 * Bruce read is recoverable later even after the underlying records move
 * on.
 *
 * Buckets, and the reasoning behind each:
 *
 *   - **Today's sessions, with prep.** Walking into a session knowing
 *     what was committed last time and what is still open is worth more
 *     than the recap that follows it. Each of today's sessions carries
 *     the previous session's date and the commitments from it that are
 *     still open.
 *   - **My items**, split overdue / today / this week. The only three
 *     buckets that change what Bruce does before lunch.
 *   - **Client-owned overdue items.** Visibility only — chasing the
 *     client is a separate, client-addressed nudge, because being the
 *     chase mechanism by hand is unpaid labour.
 *   - **Deliverables by state**, with how long they have sat there, plus
 *     anything past its promised date. Slippage is invisible until it is
 *     counted.
 *   - **Escalations.** A block that elapsed with the item still open.
 *     The ladder is in lib/ea/time-blocks.ts.
 *   - **No next step booked.** A prospect conversation that ended
 *     without a next step on the calendar is the failure the close
 *     protocol exists to prevent, and nothing else in the system notices.
 *   - **Quiet engagements.** No session held and no action item movement
 *     in fourteen days is the earliest signal of a renewal at risk.
 *
 * Dates are computed in America/Edmonton. "Today" means Bruce's today,
 * not UTC's.
 */

import { and, desc, eq, gte, inArray, lt, lte, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import {
  actionItems,
  bbsSessions,
  deliverables,
  eaTimeBlocks,
  prospects,
  userProfiles,
  type Engagement,
} from "@/lib/db/schema";
import type { Tx } from "@/lib/db/tenant";
import {
  engagementLabel,
  listEngagementsForRecipient,
  type EaRecipient,
} from "./recipients";

export const EA_TIMEZONE = "America/Edmonton";

/** Engagement is considered quiet after this long with no activity. */
const SILENCE_DAYS = 14;

/* ------------------------------ types ------------------------------ */

export type DigestItem = {
  id: string;
  title: string;
  engagementId: string;
  engagementLabel: string;
  dueDate: string | null;
  status: string;
  estimatedMinutes: number;
  assigneeName: string | null;
  daysOverdue: number | null;
};

export type DigestDeliverable = {
  id: string;
  title: string;
  type: string;
  status: string;
  engagementId: string;
  engagementLabel: string;
  /** Days since the record last changed. A proxy for time-in-state —
   *  the schema has no status-transition timestamp, and `updated_at` is
   *  the closest honest signal without a new column and a backfill. */
  daysInState: number;
  targetDate: string | null;
  daysPastTarget: number | null;
};

export type DigestSession = {
  id: string;
  engagementId: string;
  engagementLabel: string;
  title: string | null;
  scheduledAt: string;
  type: string;
  whenLabel: string;
};

export type DigestSessionPrep = DigestSession & {
  previousSessionAt: string | null;
  openCommitments: { id: string; title: string; assigneeName: string | null }[];
};

export type DigestEscalation = {
  blockId: string;
  actionItemId: string;
  title: string;
  engagementLabel: string;
  rescheduleCount: number;
  blockEndedAt: string;
  /** Carried through so the re-proposed block is sized like the
   *  original. Re-proposing a three-hour job as an hour is how an item
   *  slips a fourth time. */
  estimatedMinutes: number;
  /** Escalation copy, chosen by reschedule_count. */
  notice: string;
  severity: "note" | "warning" | "critical";
};

export type DigestProspect = {
  id: string;
  companyName: string;
  contactName: string | null;
  status: string;
  lastActivityAt: string | null;
};

export type DigestSilence = {
  engagementId: string;
  engagementLabel: string;
  lastSessionAt: string | null;
  lastItemMovementAt: string | null;
  quietDays: number;
};

export type DigestPayload = {
  version: 1;
  generatedAt: string;
  forDate: string;
  recipientName: string;
  todaysSessions: DigestSessionPrep[];
  myItems: {
    overdue: DigestItem[];
    today: DigestItem[];
    thisWeek: DigestItem[];
  };
  clientOverdue: DigestItem[];
  deliverablesByStatus: { status: string; items: DigestDeliverable[] }[];
  deliverablesPastTarget: DigestDeliverable[];
  upcomingSessions: DigestSession[];
  escalations: DigestEscalation[];
  prospectsWithoutNextStep: DigestProspect[];
  quietEngagements: DigestSilence[];
  /** Filled in by the proposer after the payload is gathered. */
  proposedBlocks: {
    blockId: string;
    actionItemId: string;
    title: string;
    engagementLabel: string;
    start: string;
    end: string;
    whenLabel: string;
    approveUrl: string;
    rescheduleCount: number;
  }[];
  counts: {
    engagements: number;
    myOpenItems: number;
  };
};

/* ---------------------------- helpers ---------------------------- */

function mt(d: Date): DateTime {
  return DateTime.fromJSDate(d, { zone: EA_TIMEZONE });
}

/** "Tue 29 Jul, 9:00 AM" — the format used throughout EA email. */
export function whenLabel(d: Date): string {
  return mt(d).toFormat("ccc d LLL, h:mm a");
}

function dayLabel(d: Date): string {
  return mt(d).toFormat("ccc d LLL");
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor(
    mt(to).startOf("day").diff(mt(from).startOf("day"), "days").days,
  );
}

/**
 * Prospect statuses that represent a live conversation. A prospect in
 * one of these with no next step booked is a ghost risk; anything
 * outside them is either untouched, won, or dead.
 */
const LIVE_PROSPECT_STATUSES = [
  "first_contact",
  "meeting_scheduled",
  "appt_completed_followup",
  "proposal_sent",
  "negotiation",
  "contract_sent",
] as const;

/** Deliverable states that still owe the client something. */
const OPEN_DELIVERABLE_STATUSES = ["not_started", "in_progress", "review"] as const;

/* --------------------------- the gather --------------------------- */

export async function gatherDigest(
  tx: Tx,
  recipient: EaRecipient,
  now: Date,
): Promise<{ payload: DigestPayload; engagements: Engagement[] }> {
  const owned = await listEngagementsForRecipient(tx, recipient);
  const engagementIds = owned.map((e) => e.id);
  const labelById = new Map(owned.map((e) => [e.id, engagementLabel(e)]));

  const nowMt = mt(now);
  const startOfToday = nowMt.startOf("day").toJSDate();
  const endOfToday = nowMt.endOf("day").toJSDate();
  const endOfWeek = nowMt.plus({ days: 7 }).endOf("day").toJSDate();
  const silenceCutoff = nowMt.minus({ days: SILENCE_DAYS }).toJSDate();

  const empty: DigestPayload = {
    version: 1,
    generatedAt: now.toISOString(),
    forDate: nowMt.toFormat("yyyy-MM-dd"),
    recipientName: recipient.fullName,
    todaysSessions: [],
    myItems: { overdue: [], today: [], thisWeek: [] },
    clientOverdue: [],
    deliverablesByStatus: [],
    deliverablesPastTarget: [],
    upcomingSessions: [],
    escalations: [],
    prospectsWithoutNextStep: [],
    quietEngagements: [],
    proposedBlocks: [],
    counts: { engagements: owned.length, myOpenItems: 0 },
  };

  if (engagementIds.length === 0) {
    // Still worth reporting ghost-risk prospects — those are not scoped
    // to an engagement.
    empty.prospectsWithoutNextStep = await gatherProspects(tx, recipient, now);
    return { payload: empty, engagements: owned };
  }

  const inOwned = inArray(actionItems.engagementId, engagementIds);
  const liveItem = and(
    ne(actionItems.status, "done"),
    ne(actionItems.status, "draft"),
  );

  /* ---- action items (mine + the client's), with assignee names ---- */

  const itemRows = await tx
    .select({
      id: actionItems.id,
      title: actionItems.title,
      engagementId: actionItems.engagementId,
      dueDate: actionItems.dueDate,
      status: actionItems.status,
      estimatedMinutes: actionItems.estimatedMinutes,
      assigneeUserProfileId: actionItems.assigneeUserProfileId,
      assigneeName: userProfiles.fullName,
      updatedAt: actionItems.updatedAt,
    })
    .from(actionItems)
    .leftJoin(userProfiles, eq(userProfiles.id, actionItems.assigneeUserProfileId))
    .where(and(inOwned, liveItem));

  const toItem = (r: (typeof itemRows)[number]): DigestItem => ({
    id: r.id,
    title: r.title,
    engagementId: r.engagementId,
    engagementLabel: labelById.get(r.engagementId) ?? "Client",
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    status: r.status,
    estimatedMinutes: r.estimatedMinutes,
    assigneeName: r.assigneeName ?? null,
    daysOverdue:
      r.dueDate && r.dueDate < startOfToday
        ? daysBetween(r.dueDate, now)
        : null,
  });

  const mine = itemRows.filter(
    (r) => r.assigneeUserProfileId === recipient.userProfileId,
  );
  const theirs = itemRows.filter(
    (r) =>
      r.assigneeUserProfileId !== null &&
      r.assigneeUserProfileId !== recipient.userProfileId,
  );

  const myOverdue = mine
    .filter((r) => r.dueDate !== null && r.dueDate < startOfToday)
    .map(toItem)
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));

  const myToday = mine
    .filter(
      (r) =>
        r.dueDate !== null &&
        r.dueDate >= startOfToday &&
        r.dueDate <= endOfToday,
    )
    .map(toItem);

  const myThisWeek = mine
    .filter(
      (r) => r.dueDate !== null && r.dueDate > endOfToday && r.dueDate <= endOfWeek,
    )
    .map(toItem)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const clientOverdue = theirs
    .filter((r) => r.dueDate !== null && r.dueDate < startOfToday)
    .map(toItem)
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));

  /* ------------------------- deliverables ------------------------- */

  const deliverableRows = await tx
    .select({
      id: deliverables.id,
      title: deliverables.title,
      type: deliverables.type,
      status: deliverables.status,
      engagementId: deliverables.engagementId,
      targetDate: deliverables.targetDate,
      updatedAt: deliverables.updatedAt,
    })
    .from(deliverables)
    .where(
      and(
        inArray(deliverables.engagementId, engagementIds),
        inArray(deliverables.status, [...OPEN_DELIVERABLE_STATUSES]),
      ),
    );

  const toDeliverable = (
    r: (typeof deliverableRows)[number],
  ): DigestDeliverable => ({
    id: r.id,
    title: r.title,
    type: r.type,
    status: r.status,
    engagementId: r.engagementId,
    engagementLabel: labelById.get(r.engagementId) ?? "Client",
    daysInState: daysBetween(r.updatedAt, now),
    targetDate: r.targetDate ? r.targetDate.toISOString() : null,
    daysPastTarget:
      r.targetDate && r.targetDate < startOfToday
        ? daysBetween(r.targetDate, now)
        : null,
  });

  const allDeliverables = deliverableRows.map(toDeliverable);
  const deliverablesByStatus = [...OPEN_DELIVERABLE_STATUSES]
    .map((status) => ({
      status,
      items: allDeliverables
        .filter((d) => d.status === status)
        .sort((a, b) => b.daysInState - a.daysInState),
    }))
    .filter((g) => g.items.length > 0);

  const deliverablesPastTarget = allDeliverables
    .filter((d) => d.daysPastTarget !== null)
    .sort((a, b) => (b.daysPastTarget ?? 0) - (a.daysPastTarget ?? 0));

  /* --------------------------- sessions --------------------------- */

  const upcomingRows = await tx
    .select({
      id: bbsSessions.id,
      engagementId: bbsSessions.engagementId,
      title: bbsSessions.title,
      scheduledAt: bbsSessions.scheduledAt,
      type: bbsSessions.type,
    })
    .from(bbsSessions)
    .where(
      and(
        inArray(bbsSessions.engagementId, engagementIds),
        eq(bbsSessions.status, "scheduled"),
        gte(bbsSessions.scheduledAt, startOfToday),
        lte(bbsSessions.scheduledAt, endOfWeek),
      ),
    );

  const upcomingSessions: DigestSession[] = upcomingRows
    .map((r) => ({
      id: r.id,
      engagementId: r.engagementId,
      engagementLabel: labelById.get(r.engagementId) ?? "Client",
      title: r.title,
      scheduledAt: r.scheduledAt.toISOString(),
      type: r.type,
      whenLabel: whenLabel(r.scheduledAt),
    }))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  /* ------------ today's sessions, with what to walk in knowing ------------ */

  const todaysRaw = upcomingRows.filter(
    (r) => r.scheduledAt >= startOfToday && r.scheduledAt <= endOfToday,
  );

  const todaysSessions: DigestSessionPrep[] = [];
  for (const s of todaysRaw) {
    const [previous] = await tx
      .select({ scheduledAt: bbsSessions.scheduledAt })
      .from(bbsSessions)
      .where(
        and(
          eq(bbsSessions.engagementId, s.engagementId),
          lt(bbsSessions.scheduledAt, s.scheduledAt),
          eq(bbsSessions.status, "completed"),
        ),
      )
      // Most recent completed session before this one — DESC, not ASC.
      // Ascending would surface the first session ever held.
      .orderBy(desc(bbsSessions.scheduledAt))
      .limit(1);

    const openCommitments = itemRows
      .filter((r) => r.engagementId === s.engagementId)
      .slice(0, 12)
      .map((r) => ({
        id: r.id,
        title: r.title,
        assigneeName: r.assigneeName ?? null,
      }));

    todaysSessions.push({
      id: s.id,
      engagementId: s.engagementId,
      engagementLabel: labelById.get(s.engagementId) ?? "Client",
      title: s.title,
      scheduledAt: s.scheduledAt.toISOString(),
      type: s.type,
      whenLabel: whenLabel(s.scheduledAt),
      previousSessionAt: previous ? previous.scheduledAt.toISOString() : null,
      openCommitments,
    });
  }

  /* -------------------------- escalations -------------------------- */

  const elapsedBlocks = await tx
    .select({
      blockId: eaTimeBlocks.id,
      actionItemId: eaTimeBlocks.actionItemId,
      proposedEnd: eaTimeBlocks.proposedEnd,
      rescheduleCount: eaTimeBlocks.rescheduleCount,
      title: actionItems.title,
      engagementId: actionItems.engagementId,
      status: actionItems.status,
      estimatedMinutes: actionItems.estimatedMinutes,
    })
    .from(eaTimeBlocks)
    .innerJoin(actionItems, eq(actionItems.id, eaTimeBlocks.actionItemId))
    .where(
      and(
        eq(eaTimeBlocks.userProfileId, recipient.userProfileId),
        eq(eaTimeBlocks.status, "approved"),
        lt(eaTimeBlocks.proposedEnd, now),
        ne(actionItems.status, "done"),
        ne(actionItems.status, "draft"),
      ),
    );

  const escalations: DigestEscalation[] = elapsedBlocks.map((b) => {
    const n = b.rescheduleCount + 1;
    return {
      blockId: b.blockId,
      actionItemId: b.actionItemId,
      title: b.title,
      engagementLabel: labelById.get(b.engagementId) ?? "Client",
      rescheduleCount: b.rescheduleCount,
      blockEndedAt: b.proposedEnd.toISOString(),
      estimatedMinutes: b.estimatedMinutes,
      ...escalationNotice(n),
    };
  });

  /* ---------------------------- prospects ---------------------------- */

  const prospectsWithoutNextStep = await gatherProspects(tx, recipient, now);

  /* ------------------------ quiet engagements ------------------------ */

  const quietEngagements: DigestSilence[] = [];
  for (const e of owned) {
    const [lastSession] = await tx
      .select({ scheduledAt: bbsSessions.scheduledAt })
      .from(bbsSessions)
      .where(
        and(
          eq(bbsSessions.engagementId, e.id),
          eq(bbsSessions.status, "completed"),
        ),
      )
      // Most recent, not earliest — this drives the quiet-days count.
      .orderBy(desc(bbsSessions.scheduledAt))
      .limit(1);

    const movement = itemRows
      .filter((r) => r.engagementId === e.id)
      .map((r) => r.updatedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const sessionRecent =
      lastSession && lastSession.scheduledAt >= silenceCutoff;
    const itemRecent = movement && movement >= silenceCutoff;
    if (sessionRecent || itemRecent) continue;

    const mostRecent = [lastSession?.scheduledAt, movement]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    quietEngagements.push({
      engagementId: e.id,
      engagementLabel: engagementLabel(e),
      lastSessionAt: lastSession ? lastSession.scheduledAt.toISOString() : null,
      lastItemMovementAt: movement ? movement.toISOString() : null,
      quietDays: mostRecent ? daysBetween(mostRecent, now) : SILENCE_DAYS,
    });
  }
  quietEngagements.sort((a, b) => b.quietDays - a.quietDays);

  const payload: DigestPayload = {
    version: 1,
    generatedAt: now.toISOString(),
    forDate: nowMt.toFormat("yyyy-MM-dd"),
    recipientName: recipient.fullName,
    todaysSessions,
    myItems: { overdue: myOverdue, today: myToday, thisWeek: myThisWeek },
    clientOverdue,
    deliverablesByStatus,
    deliverablesPastTarget,
    upcomingSessions,
    escalations,
    prospectsWithoutNextStep,
    quietEngagements,
    proposedBlocks: [],
    counts: {
      engagements: owned.length,
      myOpenItems: mine.length,
    },
  };

  return { payload, engagements: owned };
}

/**
 * The escalation ladder. A nag that never escalates gets ignored, which
 * is how the item became overdue in the first place — so the third miss
 * stops being a reminder and becomes a question.
 */
export function escalationNotice(missCount: number): {
  notice: string;
  severity: "note" | "warning" | "critical";
} {
  if (missCount <= 1) {
    return {
      notice: "The block passed and this is still open. Re-proposed below.",
      severity: "note",
    };
  }
  if (missCount === 2) {
    return {
      notice:
        "Second miss. Two blocks have now gone by without this moving — worth asking whether the estimate is wrong.",
      severity: "warning",
    };
  }
  return {
    notice:
      "This has now slipped three times. It is not a scheduling problem. Renegotiate the commitment or kill it.",
    severity: "critical",
  };
}

/**
 * Prospects in a live conversation with no next step on the calendar.
 * The close protocol depends on booking the next step before hanging up;
 * this is the only place the system notices when that did not happen.
 */
async function gatherProspects(
  tx: Tx,
  recipient: EaRecipient,
  now: Date,
): Promise<DigestProspect[]> {
  const ownerScope =
    recipient.role === "master_admin"
      ? undefined
      : eq(prospects.ownerUserProfileId, recipient.userProfileId);

  const rows = await tx
    .select({
      id: prospects.id,
      companyName: prospects.companyName,
      contactName: prospects.contactName,
      status: prospects.status,
      nextActionDate: prospects.nextActionDate,
      updatedAt: prospects.updatedAt,
      archivedAt: prospects.archivedAt,
    })
    .from(prospects)
    .where(
      ownerScope
        ? and(
            inArray(prospects.status, [...LIVE_PROSPECT_STATUSES]),
            ownerScope,
          )
        : inArray(prospects.status, [...LIVE_PROSPECT_STATUSES]),
    );

  return rows
    .filter((r) => r.archivedAt === null)
    .filter((r) => r.nextActionDate === null || r.nextActionDate < now)
    .map((r) => ({
      id: r.id,
      companyName: r.companyName,
      contactName: r.contactName,
      status: r.status,
      lastActivityAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    }))
    .sort((a, b) => (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? ""));
}

export { dayLabel };
