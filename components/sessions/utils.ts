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
