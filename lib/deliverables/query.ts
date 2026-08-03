/**
 * One definition of "this action item is one of the nine documents".
 *
 * Migration 0109 retired the `deliverables` table; a deliverable is now
 * an action item carrying a non-null `deliverable_type`. Seven call
 * sites needed that translation — the EA digest, the Friday rollup,
 * agenda drafting, global search, renewal, the engagement page and the
 * Gantt — and seven hand-written copies of the same WHERE clause is how
 * they drift apart. Same reasoning as `lib/ea/held-sessions.ts`.
 *
 * The status mapping is the part worth stating once. The old ladder was
 * not_started / in_progress / review / delivered / archived; the action
 * item ladder is draft / open / in_progress / done / blocked.
 *
 *   not_started            -> open
 *   in_progress, review    -> in_progress
 *   delivered, archived    -> done
 *
 * `draft` has no old equivalent and is the important addition: a
 * machine-drafted document now sits unpublished until a Business
 * Builder has read it. Deliverables rows were client-visible the moment
 * they were inserted, so this is a gate the old table never had — and
 * it is why every query here excludes drafts. An unreviewed draft is a
 * guess, and a guess must not be counted as work in flight, chased as
 * late, or fed to a model drafting an agenda.
 */

import { and, isNotNull, isNull, ne, type SQL } from "drizzle-orm";
import { actionItems } from "@/lib/db/schema";

/** Rows that ARE one of the nine documents, drafts excluded. */
export function isPublishedDeliverable(): SQL {
  return and(
    isNotNull(actionItems.deliverableType),
    ne(actionItems.status, "draft"),
  )!;
}

/** Rows that are ordinary commitments — NOT one of the nine documents. */
export function isPlainCommitment(): SQL {
  return and(
    isNull(actionItems.deliverableType),
    ne(actionItems.status, "draft"),
  )!;
}

/**
 * Statuses that mean a document is still owed. `done` is finished and
 * `draft` is unreviewed, so neither counts as in flight.
 */
export const OPEN_DELIVERABLE_STATUSES = [
  "open",
  "in_progress",
  "blocked",
] as const;

/**
 * When a document was finished. The retired table had a dedicated
 * `delivered_at`; action items record completion by moving to `done`,
 * so `updated_at` on a done row is the closest honest answer.
 *
 * It is an approximation and callers should know it: editing a finished
 * document moves this date. That was the cost of one list, accepted
 * deliberately — the alternative was carrying a column that only ever
 * applied to a tenth of the rows.
 */
export function deliverableCompletedAt(row: {
  status: string;
  updatedAt: Date | null;
}): Date | null {
  return row.status === "done" ? row.updatedAt : null;
}
