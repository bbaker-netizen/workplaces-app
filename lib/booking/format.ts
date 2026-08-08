/**
 * The one Mountain-Time rendering of a booked slot.
 *
 * Shared by the slot picker, the confirmation page and both booking
 * emails, so a visitor is never shown two different spellings of the
 * same appointment.
 *
 * Its own module rather than an export of `lib/actions/scheduling.ts`,
 * because every export of a `"use server"` file must be an async
 * function — a plain formatter there fails the build.
 */

import { DateTime } from "luxon";

export const BOOKING_TIMEZONE = "America/Edmonton";

export function formatSlotLocal(at: Date): string {
  return (
    DateTime.fromJSDate(at)
      .setZone(BOOKING_TIMEZONE)
      .toFormat("EEE LLL d, h:mm a 'MT'") ?? at.toISOString()
  );
}
