/**
 * Server-side sort utility for action items.
 *
 * Order: overdue first (non-done items past due_date), then by due_date
 * ascending, then no-due-date items at the bottom. Within ties, status
 * priority (open before done) then newest-created first.
 *
 * Used by server components only — Date methods require actual Date
 * objects. After server serialization the dates become strings on the
 * client, but by then the order is already established.
 */

import type { ListedActionItem } from "@/lib/db/queries/action-items";

const STATUS_PRIORITY: Record<string, number> = {
  draft: 0,
  open: 1,
  in_progress: 2,
  blocked: 3,
  done: 4,
};

export function sortActionItems<T extends ListedActionItem>(items: T[]): T[] {
  const now = Date.now();
  return [...items].sort((a, b) => {
    const aOver = isOverdue(a, now);
    const bOver = isOverdue(b, now);
    if (aOver !== bOver) return aOver ? -1 : 1;

    // Items with a due date sort before items without.
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) {
      const da = a.dueDate.getTime();
      const db = b.dueDate.getTime();
      if (da !== db) return da - db;
    }

    const sa = STATUS_PRIORITY[a.status] ?? 99;
    const sb = STATUS_PRIORITY[b.status] ?? 99;
    if (sa !== sb) return sa - sb;

    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function isOverdue(
  item: ListedActionItem,
  now: number = Date.now(),
): boolean {
  if (!item.dueDate) return false;
  if (item.status === "done") return false;
  return item.dueDate.getTime() < now;
}
