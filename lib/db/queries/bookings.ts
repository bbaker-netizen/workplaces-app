/**
 * Reading a booking back.
 *
 * Exists for the public confirmation page. That page is addressable by
 * URL, so it deliberately returns only what a confirmation needs to say —
 * no email address, no notes, no company. A booking id is a v4 uuid and
 * unguessable, but "unguessable" is not a reason to put a stranger's
 * contact details behind a shareable link.
 */

import { and, eq } from "drizzle-orm";
import { bookings, schedulingLinks, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type BookingConfirmation = {
  id: string;
  bookedAt: Date;
  durationMinutes: number;
  /** First name only — enough to confirm it is theirs, no more. */
  bookerFirstName: string;
  meetingName: string;
  description: string | null;
  builderName: string;
  cancelled: boolean;
};

/**
 * One booking, scoped to the slug it was made through.
 *
 * The slug is part of the lookup rather than decoration: it means a
 * booking id pasted under another Builder's page resolves to nothing
 * instead of rendering their meeting under the wrong heading.
 */
export async function getBookingConfirmation(
  slug: string,
  bookingId: string,
): Promise<BookingConfirmation | null> {
  try {
    const [row] = await withSystemContext((tx) =>
      tx
        .select({
          id: bookings.id,
          bookedAt: bookings.bookedAt,
          durationMinutes: bookings.durationMinutes,
          bookerName: bookings.bookerName,
          cancelledAt: bookings.cancelledAt,
          meetingName: schedulingLinks.name,
          description: schedulingLinks.description,
          builderName: userProfiles.fullName,
        })
        .from(bookings)
        .innerJoin(
          schedulingLinks,
          eq(schedulingLinks.id, bookings.schedulingLinkId),
        )
        .leftJoin(
          userProfiles,
          eq(userProfiles.id, schedulingLinks.coachUserProfileId),
        )
        .where(and(eq(bookings.id, bookingId), eq(schedulingLinks.slug, slug)))
        .limit(1),
    );
    if (!row) return null;
    return {
      id: row.id,
      bookedAt: new Date(row.bookedAt),
      durationMinutes: Number(row.durationMinutes ?? 0),
      bookerFirstName:
        row.bookerName.trim().split(/\s+/)[0] || row.bookerName.trim(),
      meetingName: row.meetingName,
      description: row.description,
      builderName: row.builderName ?? "your Business Builder",
      cancelled: row.cancelledAt !== null,
    };
  } catch (e) {
    console.error("[booking] confirmation lookup failed:", e);
    return null;
  }
}
