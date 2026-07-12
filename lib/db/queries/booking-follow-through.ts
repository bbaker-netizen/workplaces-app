/**
 * Read helper for the booking follow-through panel on the prospect card.
 * Master-org table, read via withSystemContext (Business Builder side).
 */

import { desc, eq } from "drizzle-orm";
import { bookingFollowThrough, type BookingFollowThrough } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

/** The most recent booking follow-through row for a prospect, or null. */
export async function getBookingFollowThroughForProspect(
  prospectId: string,
): Promise<BookingFollowThrough | null> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select()
      .from(bookingFollowThrough)
      .where(eq(bookingFollowThrough.prospectId, prospectId))
      .orderBy(desc(bookingFollowThrough.sessionAt))
      .limit(1);
    return row ?? null;
  });
}
