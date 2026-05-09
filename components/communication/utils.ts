/**
 * Communication — shared formatting helpers.
 *
 * Date formatting follows the same date-fns convention as the action
 * items module so both modules feel consistent: relative for "this
 * week," absolute for older.
 */

import { format, formatDistanceToNowStrict, isThisWeek } from "date-fns";

export function formatMessageTimestamp(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  // Within the last 60 seconds — show "just now" for the live feel.
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (isThisWeek(date)) {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  }
  return format(date, "MMM d, yyyy 'at' h:mm a");
}
