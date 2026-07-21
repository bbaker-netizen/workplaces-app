/**
 * Recurrence math for session series.
 *
 * Pure — no DB, no auth, no Next.js. Everything here is a function of
 * its arguments, which is what makes the materializer safe to re-run.
 *
 * All arithmetic happens on a DateTime pinned to America/Edmonton, not
 * on UTC millisecond offsets. That distinction is the whole point: a
 * 9:00 AM Tuesday touch-base must stay 9:00 AM across the March and
 * November DST boundaries. Adding 7 * 24 * 60 * 60 * 1000 ms would
 * silently shift it to 8:00 AM (or 10:00) for half the year. Luxon's
 * `plus({ weeks })` on a zoned DateTime preserves wall-clock time and
 * absorbs the offset change.
 *
 * Monthly recurrence clamps rather than overflows: an anchor on the
 * 31st yields Feb 28 (or 29), not Mar 3. Luxon does this natively.
 *
 * KNOWN EDGE CASE — monthly anchored on the 29th–31st. Because each
 * step is taken from the PREVIOUS occurrence, a clamp is sticky: an
 * anchor of Jan 31 produces Feb 28, then Mar 28, Apr 28 — it does not
 * spring back to the 31st. Google Calendar's FREQ=MONTHLY skips short
 * months instead, so for those three anchor days the generated
 * instances and the pushed calendar event can diverge after February.
 * Left as-is deliberately: month-end anchors are rare for a recurring
 * touch-base, and "always the 28th" is more predictable for a meeting
 * than "some months don't happen". Anchor monthly meetings on the
 * 1st–28th to avoid it entirely.
 */

import { DateTime } from "luxon";

export const TIMEZONE = "America/Edmonton";

export type Cadence = "weekly" | "biweekly" | "monthly";

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
};

/** How far ahead instances are kept materialized. */
export const DEFAULT_HORIZON_DAYS = 90;

/**
 * Hard cap on how many slots one call may produce. A corrupt anchor
 * (e.g. year 1970) with a distant horizon would otherwise try to
 * generate tens of thousands of rows. Well clear of the ~13 weekly
 * occurrences a 90-day horizon actually needs.
 */
const MAX_OCCURRENCES = 500;

function step(dt: DateTime, cadence: Cadence): DateTime {
  switch (cadence) {
    case "weekly":
      return dt.plus({ weeks: 1 });
    case "biweekly":
      return dt.plus({ weeks: 2 });
    case "monthly":
      return dt.plus({ months: 1 });
  }
}

/**
 * Every occurrence slot in `[from, until]`, derived by walking the
 * cadence forward from `anchorAt`.
 *
 * Walking from the anchor (rather than from `from`) is what keeps the
 * series phase-stable: a biweekly series always lands on the same
 * alternating weeks no matter when you ask, and topping up the horizon
 * later can never produce an off-phase slot.
 *
 * Returns UTC Dates, ascending. Slots at or before `from` are excluded;
 * `until` is inclusive.
 */
export function occurrencesBetween(args: {
  anchorAt: Date;
  cadence: Cadence;
  from: Date;
  until: Date;
}): Date[] {
  const anchor = DateTime.fromJSDate(args.anchorAt, { zone: TIMEZONE });
  const from = DateTime.fromJSDate(args.from, { zone: TIMEZONE });
  const until = DateTime.fromJSDate(args.until, { zone: TIMEZONE });

  if (!anchor.isValid || !from.isValid || !until.isValid) return [];
  if (until <= from) return [];

  const out: Date[] = [];
  let cursor = anchor;
  let guard = 0;

  // Fast-forward to the first slot after `from` without emitting.
  while (cursor <= from && guard < MAX_OCCURRENCES) {
    cursor = step(cursor, args.cadence);
    guard += 1;
  }

  // Guard exhausted before reaching `from` — the anchor is absurdly
  // stale (≈10 years for weekly). Bail rather than emit: the loop below
  // has no lower bound, so continuing would return hundreds of
  // BACK-DATED slots and the materializer would insert them as real
  // meetings. Matches nextOccurrence's null-on-exhaustion behaviour.
  if (cursor <= from) return [];

  while (cursor <= until && out.length < MAX_OCCURRENCES) {
    out.push(cursor.toUTC().toJSDate());
    cursor = step(cursor, args.cadence);
  }

  return out;
}

/**
 * The next occurrence strictly after `after` (default: now). Null when
 * the anchor is so stale that the cap is hit before reaching it.
 */
export function nextOccurrence(args: {
  anchorAt: Date;
  cadence: Cadence;
  after?: Date;
}): Date | null {
  const after = args.after ?? new Date();
  const anchor = DateTime.fromJSDate(args.anchorAt, { zone: TIMEZONE });
  if (!anchor.isValid) return null;

  const cutoff = DateTime.fromJSDate(after, { zone: TIMEZONE });
  let cursor = anchor;
  let guard = 0;
  while (cursor <= cutoff && guard < MAX_OCCURRENCES) {
    cursor = step(cursor, args.cadence);
    guard += 1;
  }
  return cursor > cutoff ? cursor.toUTC().toJSDate() : null;
}

/**
 * Google Calendar RRULE for a cadence. Matches the shape
 * `lib/actions/schedule-prospect-meeting.ts` already sends, so the
 * calendar integration needs no new handling.
 */
export function cadenceToRRule(cadence: Cadence): string[] {
  switch (cadence) {
    case "weekly":
      return ["RRULE:FREQ=WEEKLY"];
    case "biweekly":
      return ["RRULE:FREQ=WEEKLY;INTERVAL=2"];
    case "monthly":
      return ["RRULE:FREQ=MONTHLY"];
  }
}

/** "Every two weeks on Tuesday at 9:00 AM" — for the series header. */
export function describeCadence(anchorAt: Date, cadence: Cadence): string {
  const dt = DateTime.fromJSDate(anchorAt, { zone: TIMEZONE });
  if (!dt.isValid) return CADENCE_LABEL[cadence];
  const time = dt.toFormat("h:mm a");
  if (cadence === "monthly") {
    return `Monthly on the ${dt.toFormat("d")}${ordinalSuffix(dt.day)} at ${time}`;
  }
  const prefix = cadence === "weekly" ? "Every" : "Every other";
  return `${prefix} ${dt.toFormat("cccc")} at ${time}`;
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
