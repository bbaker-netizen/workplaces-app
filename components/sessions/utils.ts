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
 * **Why this is not just `status`.** Nothing in the app writes
 * `completed` except a person clicking "Mark complete", and almost
 * nobody does — sessions arrive from Google Calendar as `scheduled` and
 * stay that way. So every past session read as "Missed", including ones
 * that plainly went ahead. A client's record showing MISSED against a
 * session we hold a recording of is simply wrong, and it is wrong on the
 * page a Business Builder opens to review that session's recap.
 *
 * A transcript is evidence. If Fireflies recorded the meeting, the
 * meeting happened, whatever the status column says — so it reads
 * "Held", in the neutral tone. Only a past session with NO recording is
 * still "Missed" and still orange, because there the alarm is doing real
 * work: nothing shows the session took place.
 *
 * Read-side only, exactly like `sessionWasHeld` on the server. We are
 * not writing a claim we cannot verify — `completeSession()` still means
 * what it always meant, and a session someone marked complete keeps
 * saying so.
 *
 * One helper, imported by both the list and the detail view, so the two
 * cannot drift apart.
 */
export function sessionStatusLabel(session: {
  status: "scheduled" | "completed" | "cancelled";
  scheduledAt: Date;
  firefliesRecordingId?: string | null;
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

  const wasRecorded = Boolean(session.firefliesRecordingId);
  return {
    label: wasRecorded ? "Held" : "Missed",
    isAlarm: !wasRecorded,
    isPastUnmarked: true,
  };
}
