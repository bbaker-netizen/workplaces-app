/**
 * Stale-lead rules — shared by the daily nudge cron and the prospect
 * page banner so "stale" means the same thing everywhere.
 *
 * A lead is stale when it's an OPEN prospect (not won, not lost, not
 * archived) that hasn't been contacted in STALE_DAYS. "Last contact" is
 * `last_contact_at` when we have it, otherwise when the lead came in
 * (`created_at`) — a lead nobody has ever touched counts against the
 * clock from day one.
 */

import type { ProspectStatus } from "@/lib/pipeline/stages";

/** Days of no contact before a lead is considered stale. */
export const STALE_DAYS = 14;

/** How long before we're willing to re-nudge on the same stale lead. */
export const STALE_RENOTIFY_DAYS = 10;

const TERMINAL: ProspectStatus[] = ["onboarded", "lost", "not_qualified"];

export function isOpenStatus(status: string): boolean {
  return !TERMINAL.includes(status as ProspectStatus);
}

/** Whole days since the last contact (or lead creation). */
export function daysSinceContact(
  lastContactAt: Date | null,
  createdAt: Date,
  now: Date = new Date(),
): number {
  const ref = lastContactAt ?? createdAt;
  return Math.floor((now.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
}

export function isProspectStale(input: {
  status: string;
  lastContactAt: Date | null;
  createdAt: Date;
  archivedAt: Date | null;
  now?: Date;
}): boolean {
  if (input.archivedAt) return false;
  if (!isOpenStatus(input.status)) return false;
  return (
    daysSinceContact(input.lastContactAt, input.createdAt, input.now) >=
    STALE_DAYS
  );
}
