/**
 * Display utilities for action items — used by both server and client
 * components. All inputs accept Date | string | null because Next.js
 * serializes server → client props as JSON (Date → ISO string).
 */

import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from "date-fns";

export type ActionItemStatus =
  | "draft"
  | "open"
  | "in_progress"
  | "done"
  | "blocked";

export const STATUS_LABEL: Record<ActionItemStatus, string> = {
  draft: "Draft",
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

export const STATUSES_VISIBLE_TO_CLIENT: readonly ActionItemStatus[] = [
  "open",
  "in_progress",
  "done",
  "blocked",
];

export const STATUSES_VISIBLE_TO_COACH: readonly ActionItemStatus[] = [
  "draft",
  "open",
  "in_progress",
  "done",
  "blocked",
];

function toDate(d: Date | string | null | undefined): Date | null {
  if (d === null || d === undefined) return null;
  if (d instanceof Date) return d;
  return new Date(d);
}

export function formatDueDate(d: Date | string | null | undefined): string {
  const date = toDate(d);
  if (!date) return "No due date";
  if (isToday(date)) return "Due today";
  if (isTomorrow(date)) return "Due tomorrow";
  // For dates within a week (past or future), use relative; otherwise absolute
  const now = Date.now();
  const diffDays = Math.abs((date.getTime() - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 14) {
    return isPast(date)
      ? `Overdue ${formatDistanceToNow(date)}`
      : `Due in ${formatDistanceToNow(date)}`;
  }
  return `Due ${format(date, "MMM d, yyyy")}`;
}

export function isOverdueFromAny(
  due: Date | string | null | undefined,
  status: ActionItemStatus,
): boolean {
  const date = toDate(due);
  if (!date) return false;
  if (status === "done") return false;
  return date.getTime() < Date.now();
}

export function dateToInputValue(
  d: Date | string | null | undefined,
): string {
  const date = toDate(d);
  if (!date) return "";
  return format(date, "yyyy-MM-dd");
}
