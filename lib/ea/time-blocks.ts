/**
 * Focus-time blocks — proposing them, placing them, and retiring them.
 *
 * The digest proposes; one tap places. Nothing is ever written to the
 * calendar without Bruce asking for it, which is the whole reason the
 * proposal and the placement are two separate steps with a token in
 * between.
 *
 * Placement rules, and why each one is there:
 *
 *   - **08:30–18:00 Mountain, weekdays only.** The same window the email
 *     sender already enforces. An assistant that books Saturday work is
 *     not helping.
 *   - **Nothing within thirty minutes of a BBS session.** A block that
 *     butts against a client session either eats the prep or runs into
 *     the session itself. Ordinary calendar events get no buffer; BBS
 *     sessions do, because they are the appointments that actually cost
 *     something to be late for.
 *   - **Four hours of proposed blocks per day, maximum.** Past that the
 *     digest stops being a plan and becomes a wall, and a wall gets
 *     ignored wholesale. Already-approved blocks count toward the cap.
 *   - **Overdue first.** Slot allocation is scarce; it goes to what has
 *     already slipped before what merely has a date.
 *
 * Retirement is the part that has to be right:
 *
 *   - Completing the item deletes any FUTURE block from Google and marks
 *     the block completed, so a finished commitment stops occupying time
 *     and stops reappearing.
 *   - A block whose end time passes with the item still open is
 *     re-proposed with `reschedule_count` incremented, and the digest
 *     escalates the language each time. See `escalationNotice`.
 *
 * Idempotency is at the database, not in this code:
 * `(action_item_id, proposed_start)` is UNIQUE, and every insert here
 * uses `onConflictDoNothing`. A re-run of the digest job, or two
 * overlapping runs, propose nothing new rather than duplicating.
 */

import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import { actionItems, bbsSessions, eaTimeBlocks } from "@/lib/db/schema";
import { withSystemContext, type Tx } from "@/lib/db/tenant";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  hasGoogleConnection,
  listExternalEvents,
  type ExternalEvent,
} from "@/lib/integrations/google-calendar";
import { EA_TIMEZONE, whenLabel, type DigestPayload } from "./digest-data";
import type { EaRecipient } from "./recipients";
import { approvalUrl, mintApprovalToken } from "./tokens";

const WORK_START_MIN = 8 * 60 + 30; // 08:30
const WORK_END_MIN = 18 * 60; // 18:00
const SLOT_STEP_MIN = 15;
const SESSION_BUFFER_MIN = 30;
const MAX_BLOCK_MINUTES_PER_DAY = 4 * 60;
/** How many working days ahead the proposer will look for a slot. */
const HORIZON_WORKING_DAYS = 5;
/** Never propose a block starting sooner than this from now. */
const LEAD_TIME_MIN = 30;

type Busy = { start: DateTime; end: DateTime };

/* ------------------------- slot arithmetic ------------------------- */

function toMt(d: Date): DateTime {
  return DateTime.fromJSDate(d, { zone: EA_TIMEZONE });
}

function isWorkday(d: DateTime): boolean {
  return d.weekday >= 1 && d.weekday <= 5;
}

function minutesOfDay(d: DateTime): number {
  return d.hour * 60 + d.minute;
}

/**
 * Free windows inside one working day, given the busy intervals that
 * overlap it. Pure — all the calendar I/O happens in the caller.
 */
export function freeWindowsForDay(
  day: DateTime,
  busy: Busy[],
  earliest: DateTime,
): Busy[] {
  if (!isWorkday(day)) return [];

  const dayStart = day.set({
    hour: Math.floor(WORK_START_MIN / 60),
    minute: WORK_START_MIN % 60,
    second: 0,
    millisecond: 0,
  });
  const dayEnd = day.set({
    hour: Math.floor(WORK_END_MIN / 60),
    minute: WORK_END_MIN % 60,
    second: 0,
    millisecond: 0,
  });

  let cursor = earliest > dayStart ? earliest : dayStart;
  // Round the cursor up to the next slot boundary so proposals land on
  // tidy times rather than 09:07.
  const rem = minutesOfDay(cursor) % SLOT_STEP_MIN;
  if (rem !== 0) cursor = cursor.plus({ minutes: SLOT_STEP_MIN - rem });
  if (cursor >= dayEnd) return [];

  const overlapping = busy
    .filter((b) => b.end > cursor && b.start < dayEnd)
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const free: Busy[] = [];
  for (const b of overlapping) {
    if (b.start > cursor) {
      free.push({ start: cursor, end: b.start < dayEnd ? b.start : dayEnd });
    }
    if (b.end > cursor) cursor = b.end;
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });

  return free.filter((w) => w.end.diff(w.start, "minutes").minutes >= SLOT_STEP_MIN);
}

/* --------------------------- the proposer --------------------------- */

export type ProposedBlock = DigestPayload["proposedBlocks"][number];

/**
 * Read the calendar window the proposer needs, outside any transaction.
 *
 * Returns null when Google is not connected. That is not the same as "no
 * events": without a free/busy read we would be proposing into meetings,
 * and a proposal that double-books is worse than no proposal, so the
 * caller skips proposing entirely.
 */
export async function loadCalendarWindow(
  userProfileId: string,
  now: Date,
): Promise<ExternalEvent[] | null> {
  if (!(await hasGoogleConnection(userProfileId))) {
    console.warn(
      `[ea] ${userProfileId} has no Google connection; skipping block proposals.`,
    );
    return null;
  }
  const horizonEnd = toMt(now)
    .plus({ days: HORIZON_WORKING_DAYS + 3 })
    .endOf("day")
    .toJSDate();
  try {
    return await listExternalEvents(userProfileId, now, horizonEnd);
  } catch (e) {
    console.error("[ea] could not read the calendar; not proposing blocks:", e);
    return null;
  }
}

/**
 * Propose blocks for the items in `payload`, write them, mint an
 * approve token for each, and return the rows the email renders.
 *
 * Returns an empty list (and logs) when Google is not connected: without
 * a free/busy read we would be proposing into meetings, and a proposal
 * that double-books is worse than no proposal.
 */
export async function proposeBlocks(
  tx: Tx,
  recipient: EaRecipient,
  payload: DigestPayload,
  now: Date,
  digestId: string,
  /** Fetched by the caller BEFORE opening the transaction — holding a
   *  database transaction open across a Google round trip would pin a
   *  pooled connection for the length of an HTTP call. */
  external: ExternalEvent[],
): Promise<ProposedBlock[]> {
  const nowMt = toMt(now);

  // Busy set: everything already on the calendar, plus BBS sessions with
  // a buffer either side.
  const busy: Busy[] = external.map((e) => ({
    start: toMt(e.start),
    end: toMt(e.end),
  }));

  const sessions = await tx
    .select({
      scheduledAt: bbsSessions.scheduledAt,
      durationMin: bbsSessions.durationMin,
    })
    .from(bbsSessions)
    .where(
      and(
        eq(bbsSessions.status, "scheduled"),
        gt(bbsSessions.scheduledAt, now),
      ),
    );
  for (const s of sessions) {
    const start = toMt(s.scheduledAt);
    busy.push({
      start: start.minus({ minutes: SESSION_BUFFER_MIN }),
      end: start.plus({ minutes: s.durationMin + SESSION_BUFFER_MIN }),
    });
  }

  // Blocks already proposed or approved and still ahead of us occupy
  // time too — otherwise consecutive digests stack blocks on one slot.
  const existing = await tx
    .select({
      proposedStart: eaTimeBlocks.proposedStart,
      proposedEnd: eaTimeBlocks.proposedEnd,
    })
    .from(eaTimeBlocks)
    .where(
      and(
        eq(eaTimeBlocks.userProfileId, recipient.userProfileId),
        inArray(eaTimeBlocks.status, ["proposed", "approved"]),
        gt(eaTimeBlocks.proposedEnd, now),
      ),
    );
  for (const b of existing) {
    busy.push({ start: toMt(b.proposedStart), end: toMt(b.proposedEnd) });
  }

  // Per-day minute budget, seeded with what is already committed.
  const dayBudget = new Map<string, number>();
  const budgetKey = (d: DateTime) => d.toFormat("yyyy-MM-dd");
  for (const b of existing) {
    const k = budgetKey(toMt(b.proposedStart));
    const mins = toMt(b.proposedEnd).diff(toMt(b.proposedStart), "minutes").minutes;
    dayBudget.set(k, (dayBudget.get(k) ?? 0) + mins);
  }

  /* ---- candidates: escalated first, then overdue, then dated ---- */

  const escalated = payload.escalations.map((e) => ({
    actionItemId: e.actionItemId,
    title: e.title,
    engagementLabel: e.engagementLabel,
    estimatedMinutes: e.estimatedMinutes || 60,
    rescheduleCount: e.rescheduleCount + 1,
  }));

  const alreadyQueued = new Set(escalated.map((e) => e.actionItemId));
  const fromBuckets = [
    ...payload.myItems.overdue,
    ...payload.myItems.today,
    ...payload.myItems.thisWeek,
  ]
    .filter((i) => !alreadyQueued.has(i.id))
    .map((i) => ({
      actionItemId: i.id,
      title: i.title,
      engagementLabel: i.engagementLabel,
      estimatedMinutes: i.estimatedMinutes || 60,
      rescheduleCount: 0,
    }));

  // Items that already hold a live block don't need another one.
  const liveBlockItemIds = new Set(
    (
      await tx
        .select({ actionItemId: eaTimeBlocks.actionItemId })
        .from(eaTimeBlocks)
        .where(
          and(
            eq(eaTimeBlocks.userProfileId, recipient.userProfileId),
            inArray(eaTimeBlocks.status, ["proposed", "approved"]),
            gt(eaTimeBlocks.proposedEnd, now),
          ),
        )
    ).map((r) => r.actionItemId),
  );

  const candidates = [...escalated, ...fromBuckets].filter(
    (c) => !liveBlockItemIds.has(c.actionItemId),
  );

  /* ------------------------- place them ------------------------- */

  const placed: ProposedBlock[] = [];
  const earliest = nowMt.plus({ minutes: LEAD_TIME_MIN });

  for (const c of candidates) {
    const duration = Math.max(
      SLOT_STEP_MIN,
      Math.min(c.estimatedMinutes, MAX_BLOCK_MINUTES_PER_DAY),
    );

    let slot: Busy | null = null;
    let dayCursor = nowMt.startOf("day");
    let workdaysWalked = 0;

    while (workdaysWalked < HORIZON_WORKING_DAYS && slot === null) {
      if (!isWorkday(dayCursor)) {
        dayCursor = dayCursor.plus({ days: 1 });
        continue;
      }
      workdaysWalked++;

      const key = budgetKey(dayCursor);
      const used = dayBudget.get(key) ?? 0;
      if (used + duration > MAX_BLOCK_MINUTES_PER_DAY) {
        dayCursor = dayCursor.plus({ days: 1 });
        continue;
      }

      const windows = freeWindowsForDay(dayCursor, busy, earliest);
      for (const w of windows) {
        if (w.end.diff(w.start, "minutes").minutes >= duration) {
          slot = { start: w.start, end: w.start.plus({ minutes: duration }) };
          break;
        }
      }
      if (slot === null) dayCursor = dayCursor.plus({ days: 1 });
    }

    if (!slot) continue;

    const inserted = await tx
      .insert(eaTimeBlocks)
      .values({
        orgId: recipient.orgId,
        actionItemId: c.actionItemId,
        userProfileId: recipient.userProfileId,
        proposedStart: slot.start.toJSDate(),
        proposedEnd: slot.end.toJSDate(),
        status: "proposed",
        rescheduleCount: c.rescheduleCount,
        digestId,
      })
      // (action_item_id, proposed_start) is UNIQUE. A concurrent or
      // repeated run lands here and inserts nothing.
      .onConflictDoNothing()
      .returning({ id: eaTimeBlocks.id });

    if (inserted.length === 0) continue;
    const blockId = inserted[0].id;

    const token = await mintApprovalToken(tx, {
      orgId: recipient.orgId,
      userProfileId: recipient.userProfileId,
      subjectType: "time_block",
      subjectId: blockId,
    });

    // Claim the space so the next candidate doesn't take the same slot.
    busy.push(slot);
    const k = budgetKey(slot.start);
    dayBudget.set(k, (dayBudget.get(k) ?? 0) + duration);

    placed.push({
      blockId,
      actionItemId: c.actionItemId,
      title: c.title,
      engagementLabel: c.engagementLabel,
      start: slot.start.toJSDate().toISOString(),
      end: slot.end.toJSDate().toISOString(),
      whenLabel: `${whenLabel(slot.start.toJSDate())} – ${slot.end.toFormat("h:mm a")}`,
      approveUrl: approvalUrl(token),
      rescheduleCount: c.rescheduleCount,
    });
  }

  // Mark the elapsed blocks as rescheduled so they stop re-escalating
  // off the same row; the newly proposed block carries the count forward.
  if (payload.escalations.length > 0) {
    await tx
      .update(eaTimeBlocks)
      .set({ status: "rescheduled" })
      .where(
        inArray(
          eaTimeBlocks.id,
          payload.escalations.map((e) => e.blockId),
        ),
      );
  }

  // Proposals Bruce never actioned, whose slot has now gone by. Left
  // alone they accumulate forever as permanently `proposed` rows and
  // muddy any future read of "what is outstanding". They are not
  // escalated — an ignored proposal is not a missed commitment, it is a
  // suggestion that lapsed — so they are retired quietly.
  await tx
    .update(eaTimeBlocks)
    .set({ status: "rescheduled" })
    .where(
      and(
        eq(eaTimeBlocks.userProfileId, recipient.userProfileId),
        eq(eaTimeBlocks.status, "proposed"),
        lt(eaTimeBlocks.proposedEnd, now),
      ),
    );

  return placed;
}

/* --------------------------- approval --------------------------- */

export type ApproveResult =
  | { ok: true; start: Date; end: Date; title: string }
  | { ok: false; reason: string };

/**
 * Place an approved block on Google Calendar and record the event id.
 *
 * Guarded against double-placement by the block's own status: only a
 * `proposed` row is eligible, and the update that flips it to `approved`
 * is matched on that status. The token is single-use as well, so this is
 * the second of two locks.
 */
export async function approveTimeBlock(
  blockId: string,
): Promise<ApproveResult> {
  const ctx = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        id: eaTimeBlocks.id,
        status: eaTimeBlocks.status,
        userProfileId: eaTimeBlocks.userProfileId,
        proposedStart: eaTimeBlocks.proposedStart,
        proposedEnd: eaTimeBlocks.proposedEnd,
        title: actionItems.title,
        description: actionItems.description,
      })
      .from(eaTimeBlocks)
      .innerJoin(actionItems, eq(actionItems.id, eaTimeBlocks.actionItemId))
      .where(eq(eaTimeBlocks.id, blockId))
      .limit(1);
    return row ?? null;
  });

  if (!ctx) return { ok: false, reason: "That block no longer exists." };
  if (ctx.status === "approved") {
    return { ok: false, reason: "That block is already on your calendar." };
  }
  if (ctx.status !== "proposed") {
    return { ok: false, reason: `That block is ${ctx.status}.` };
  }

  const startMt = toMt(ctx.proposedStart);
  const endMt = toMt(ctx.proposedEnd);

  let eventId: string;
  let calendarId: string;
  try {
    const created = await createCalendarEvent(ctx.userProfileId, {
      summary: `Focus: ${ctx.title}`,
      description:
        (ctx.description ? `${ctx.description}\n\n` : "") +
        "Blocked by your assistant from the morning briefing.",
      start: { dateTime: startMt.toISO() ?? "", timeZone: EA_TIMEZONE },
      end: { dateTime: endMt.toISO() ?? "", timeZone: EA_TIMEZONE },
    });
    eventId = created.eventId;
    calendarId = created.calendarId;
  } catch (e) {
    console.error("[ea] calendar event creation failed:", e);
    return {
      ok: false,
      reason: "Could not reach Google Calendar. Try again in a moment.",
    };
  }

  const updated = await withSystemContext(async (tx) =>
    tx
      .update(eaTimeBlocks)
      .set({ status: "approved", googleEventId: eventId, googleCalendarId: calendarId })
      .where(and(eq(eaTimeBlocks.id, blockId), eq(eaTimeBlocks.status, "proposed")))
      .returning({ id: eaTimeBlocks.id }),
  );

  if (updated.length === 0) {
    // Someone approved it between our read and our write. Remove the
    // duplicate event we just made rather than leaving it orphaned.
    await deleteCalendarEvent(ctx.userProfileId, eventId, calendarId).catch(
      () => {},
    );
    return { ok: false, reason: "That block is already on your calendar." };
  }

  return {
    ok: true,
    start: ctx.proposedStart,
    end: ctx.proposedEnd,
    title: ctx.title,
  };
}

/** Summary for the approve link's confirmation page. */
export async function describeTimeBlock(blockId: string): Promise<{
  title: string;
  whenLabel: string;
  status: string;
} | null> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        title: actionItems.title,
        proposedStart: eaTimeBlocks.proposedStart,
        proposedEnd: eaTimeBlocks.proposedEnd,
        status: eaTimeBlocks.status,
      })
      .from(eaTimeBlocks)
      .innerJoin(actionItems, eq(actionItems.id, eaTimeBlocks.actionItemId))
      .where(eq(eaTimeBlocks.id, blockId))
      .limit(1);
    if (!row) return null;
    return {
      title: row.title,
      whenLabel: `${whenLabel(row.proposedStart)} to ${toMt(row.proposedEnd).toFormat("h:mm a")}`,
      status: row.status,
    };
  });
}

/* -------------------------- retirement -------------------------- */

/**
 * Called when an action item is completed. Removes any FUTURE calendar
 * block for it and marks the block completed, so a finished commitment
 * stops holding time and never reappears in tomorrow's digest.
 *
 * Past blocks are left alone: they are a record of time actually spent,
 * and deleting history from someone's calendar is not the assistant's
 * job. Best-effort — a Google failure logs and does not roll back the
 * completion the user just performed.
 */
export async function retireBlocksForCompletedItem(
  actionItemId: string,
): Promise<{ removed: number }> {
  const now = new Date();

  const blocks = await withSystemContext(async (tx) =>
    tx
      .select({
        id: eaTimeBlocks.id,
        userProfileId: eaTimeBlocks.userProfileId,
        googleEventId: eaTimeBlocks.googleEventId,
        googleCalendarId: eaTimeBlocks.googleCalendarId,
        proposedEnd: eaTimeBlocks.proposedEnd,
      })
      .from(eaTimeBlocks)
      .where(
        and(
          eq(eaTimeBlocks.actionItemId, actionItemId),
          inArray(eaTimeBlocks.status, ["proposed", "approved"]),
          gt(eaTimeBlocks.proposedEnd, now),
        ),
      ),
  );

  if (blocks.length === 0) return { removed: 0 };

  for (const b of blocks) {
    if (b.googleEventId && b.googleCalendarId) {
      try {
        await deleteCalendarEvent(
          b.userProfileId,
          b.googleEventId,
          b.googleCalendarId,
        );
      } catch (e) {
        console.error(
          `[ea] could not delete calendar event ${b.googleEventId}:`,
          e,
        );
      }
    }
  }

  await withSystemContext(async (tx) =>
    tx
      .update(eaTimeBlocks)
      .set({ status: "completed", googleEventId: null })
      .where(
        inArray(
          eaTimeBlocks.id,
          blocks.map((b) => b.id),
        ),
      ),
  );

  return { removed: blocks.length };
}

/**
 * Decline a proposed block. Nothing is written to the calendar; the row
 * is kept so the digest can tell "Bruce said no" from "never offered".
 */
export async function declineTimeBlock(
  blockId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const updated = await withSystemContext(async (tx) =>
    tx
      .update(eaTimeBlocks)
      .set({ status: "declined" })
      .where(and(eq(eaTimeBlocks.id, blockId), eq(eaTimeBlocks.status, "proposed")))
      .returning({ id: eaTimeBlocks.id }),
  );
  if (updated.length === 0) {
    return { ok: false, reason: "That block was already actioned." };
  }
  return { ok: true };
}
