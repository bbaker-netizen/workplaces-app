/**
 * The receipt for every attempt on a public booking page.
 *
 * Deliberately NOT `"use server"`: every export of such a module becomes
 * a browser-reachable POST endpoint, and an unauthenticated writer into a
 * practice-wide table must not be one. Same rule as
 * `lib/integrations/fireflies-sync.ts` and `lib/documents/new-version.ts`.
 *
 * See migration 0120 for why this table exists.
 */

import { and, desc, gte, inArray } from "drizzle-orm";
import { bookingAttempts, type BookingAttempt } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type BookingOutcome = "booked" | "refused" | "error";

export type RecordAttemptInput = {
  slug: string;
  orgId?: string | null;
  schedulingLinkId?: string | null;
  requestedStart?: Date | null;
  bookerName?: string | null;
  bookerEmail?: string | null;
  outcome: BookingOutcome;
  /** Short label for grouping, e.g. "slot-taken". */
  reason?: string | null;
  /** The sentence the visitor saw, or the error text. */
  detail?: string | null;
  bookingId?: string | null;
};

/**
 * Write the receipt.
 *
 * NEVER THROWS. This is bookkeeping about a booking; it must not be able
 * to break the booking it only observes — the same rule `withHeartbeat`
 * and `recordAvailabilityOutcome` follow. A swallowed failure here costs
 * one row of history; a thrown one would cost a client.
 *
 * Runs in its OWN transaction, outside the booking's. The booking
 * transaction signals a refusal by throwing, so an attempt row written
 * inside it would be rolled back by the very outcome it is recording.
 */
export async function recordBookingAttempt(
  input: RecordAttemptInput,
): Promise<void> {
  try {
    await withSystemContext(async (tx) => {
      await tx.insert(bookingAttempts).values({
        slug: input.slug,
        orgId: input.orgId ?? null,
        schedulingLinkId: input.schedulingLinkId ?? null,
        requestedStart: input.requestedStart ?? null,
        bookerName: input.bookerName ?? null,
        bookerEmail: input.bookerEmail ?? null,
        outcome: input.outcome,
        reason: input.reason ?? null,
        // Bounded: a provider error can be very long and this is read on
        // a console page, not kept for forensics.
        detail: input.detail?.slice(0, 2000) ?? null,
        bookingId: input.bookingId ?? null,
      });
    });
  } catch (e) {
    console.error("[booking] could not record the attempt:", e);
  }
}

export type BookingAttemptRow = Pick<
  BookingAttempt,
  | "id"
  | "slug"
  | "outcome"
  | "reason"
  | "detail"
  | "bookerName"
  | "bookerEmail"
  | "requestedStart"
  | "createdAt"
>;

/**
 * Recent attempts across the practice's links, newest first.
 *
 * System context because booking links and their attempts live in the
 * master org and the console reads them cross-link. `sinceDays` bounds
 * the read; the console shows a short window, not an archive.
 */
export async function listRecentBookingAttempts(opts: {
  linkIds?: string[];
  sinceDays?: number;
  limit?: number;
}): Promise<BookingAttemptRow[]> {
  const since = new Date(
    Date.now() - (opts.sinceDays ?? 14) * 24 * 60 * 60 * 1000,
  );
  try {
    return await withSystemContext(async (tx) =>
      tx
        .select({
          id: bookingAttempts.id,
          slug: bookingAttempts.slug,
          outcome: bookingAttempts.outcome,
          reason: bookingAttempts.reason,
          detail: bookingAttempts.detail,
          bookerName: bookingAttempts.bookerName,
          bookerEmail: bookingAttempts.bookerEmail,
          requestedStart: bookingAttempts.requestedStart,
          createdAt: bookingAttempts.createdAt,
        })
        .from(bookingAttempts)
        .where(
          opts.linkIds && opts.linkIds.length > 0
            ? and(
                gte(bookingAttempts.createdAt, since),
                // Scoped to the caller's own links. An attempt whose link
                // was since deleted keeps its slug but no link id, so it
                // drops out here rather than being shown under someone
                // else's heading.
                inArray(bookingAttempts.schedulingLinkId, opts.linkIds),
              )
            : gte(bookingAttempts.createdAt, since),
        )
        .orderBy(desc(bookingAttempts.createdAt))
        .limit(opts.limit ?? 25),
    );
  } catch (e) {
    console.error("[booking] could not read recent attempts:", e);
    return [];
  }
}
