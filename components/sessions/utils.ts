/**
 * Shared client-side helpers for the BBS Sessions module.
 */

import { DateTime } from "luxon";

const TIMEZONE = "America/Edmonton";

/** Pretty timestamp: "Mon May 18, 2:30 PM MT". */
export function formatSessionTime(d: Date): string {
  return DateTime.fromJSDate(d)
    .setZone(TIMEZONE)
    .toFormat("EEE LLL d, h:mm a 'MT'");
}

/** Compact: "May 18, 2:30 PM". */
export function formatSessionTimeShort(d: Date): string {
  return DateTime.fromJSDate(d)
    .setZone(TIMEZONE)
    .toFormat("LLL d, h:mm a");
}

/**
 * Convert a Date into a string suitable for a `<input type="datetime-local">`
 * value attribute, in the user's Mountain Time. The control reads/writes
 * this string in local time without timezone info; we treat the raw
 * input as Mountain Time on the way back out.
 */
export function toDateTimeLocalValue(d: Date): string {
  return DateTime.fromJSDate(d)
    .setZone(TIMEZONE)
    .toFormat("yyyy-LL-dd'T'HH:mm");
}

/** Reverse of `toDateTimeLocalValue` — interprets the raw control value
 *  as Mountain Time and returns a UTC Date. */
export function fromDateTimeLocalValue(value: string): Date {
  return DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", {
    zone: TIMEZONE,
  }).toJSDate();
}

export const SESSION_TYPE_LABEL: Record<"in_person" | "virtual", string> = {
  in_person: "In-person",
  virtual: "Virtual",
};

export const SESSION_STATUS_LABEL: Record<
  "scheduled" | "completed" | "cancelled",
  string
> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * What the status pill should say, and whether it deserves the alarm
 * colour.
 *
 * **The rule: a past session that was not cancelled was HELD.** This is
 * the same definition `lib/ea/held-sessions.ts` applies on the server —
 * `cancelled` is already the marker for a meeting that did not happen,
 * so it carries the negative case and nothing has to be inferred.
 *
 * **Why the UI used to disagree, and why that mattered.** Nothing writes
 * `completed` except a person clicking "Mark complete", and almost
 * nobody does — sessions arrive from Google Calendar as `scheduled` and
 * stay that way. The pill inferred "Missed" from the absence of that
 * click, which the server had explicitly declined to infer.
 *
 * That was survivable while the calendar sync was only importing a
 * trickle of sessions. When the sync's missing pagination was fixed and
 * it read the whole window for the first time, 258 historical sessions
 * arrived at once and 180 of them lit up orange as "MISSED" — 37 of
 * those on portals real clients can see. Almost none had been missed;
 * they were months-old meetings that went ahead and simply were not
 * recorded by Fireflies. Telling a client they missed sixteen sessions
 * they attended is worse than saying nothing.
 *
 * So there is no "Missed" any more. A genuinely missed meeting no longer
 * flags itself, which is the accepted cost: it never did so reliably,
 * because it depended on a manual click. Cancel a meeting that does not
 * happen and the record is accurate.
 *
 * Read-side only. `completeSession()` still means what it always meant,
 * and a session someone marked complete keeps saying "Completed".
 *
 * One helper, imported by both the list and the detail view, so the two
 * cannot drift apart.
 */
export function sessionStatusLabel(session: {
  status: "scheduled" | "completed" | "cancelled";
  scheduledAt: Date;
}): { label: string; isAlarm: boolean; isPastUnmarked: boolean } {
  const isPastUnmarked =
    session.status === "scheduled" && new Date(session.scheduledAt) < new Date();

  if (!isPastUnmarked) {
    return {
      label: SESSION_STATUS_LABEL[session.status],
      isAlarm: false,
      isPastUnmarked: false,
    };
  }

  // Past and not cancelled. Held, in the neutral tone — never orange.
  return { label: "Held", isAlarm: false, isPastUnmarked: true };
}
