/**
 * "You're booked" — a real page, not a piece of component state.
 *
 * The confirmation used to live in `BookingForm`'s `success` state, which
 * made it as durable as the tab: a refresh, a back-then-forward, or any
 * re-render that returned zero slots put the visitor back at the picker
 * with no sign anything had happened. Worse, the empty-slots early return
 * was checked BEFORE `success`, so a booking made against a calendar that
 * went unreadable a second later replaced the confirmation with "no times
 * available" — success rendering as failure.
 *
 * A URL fixes all of that at once. It survives a refresh, it can be
 * returned to, it reads the booking that actually persisted rather than
 * what the browser believed, and it is the thing the visitor can screenshot.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, User } from "lucide-react";
import { formatSlotLocal } from "@/lib/booking/format";
import { prepFor } from "@/lib/booking/meeting-types";
import { PrepRequirementNotice } from "@/components/scheduling/PrepRequirementNotice";
import { getBookingConfirmation } from "@/lib/db/queries/bookings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function BookingConfirmedPage({
  params,
}: {
  params: { slug: string; bookingId: string };
}) {
  const booking = await getBookingConfirmation(params.slug, params.bookingId);
  if (!booking) notFound();
  // Repeated here as well as in the email. This is the page someone
  // screenshots, and it is the page they come back to when they cannot
  // find the email — so it has to answer "what was I supposed to send?"
  // on its own. Not shown on a cancelled booking: nothing is owed.
  const prep = booking.cancelled ? null : prepFor(booking.meetingType);

  return (
    <main className="min-h-screen bg-background py-12 px-6">
      <div className="max-w-xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Business Builder Portal · By Workplaces
          </p>
          <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
            {booking.cancelled ? "This booking was cancelled" : "You're booked"}
          </h1>
        </header>

        {booking.cancelled ? (
          <div className="border border-tbb-line rounded-md bg-white p-6 space-y-3">
            <p className="font-sans text-sm text-foreground">
              This time was booked and has since been cancelled, so nothing is
              held for {booking.bookerFirstName}.
            </p>
            <Link
              href={`/book/${params.slug}`}
              className="inline-block font-sans text-sm font-bold uppercase tracking-tbb-caps text-tbb-navy underline underline-offset-4"
            >
              Pick another time
            </Link>
          </div>
        ) : (
          <div className="border border-tbb-blue rounded-md bg-tbb-cream-50 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <CalendarCheck
                className="w-6 h-6 text-tbb-navy shrink-0 mt-0.5"
                aria-hidden
              />
              <div className="space-y-1">
                <p className="font-bold text-foreground text-xl tracking-tight">
                  {formatSlotLocal(booking.bookedAt)}
                </p>
                <p className="font-sans text-sm text-muted-foreground">
                  {booking.meetingName}
                </p>
              </div>
            </div>

            <dl className="space-y-1.5 border-t border-tbb-line pt-4">
              <div className="flex items-center gap-2 font-sans text-sm text-foreground">
                <Clock className="w-4 h-4 text-tbb-ink-3" aria-hidden />
                <span>{booking.durationMinutes} minutes</span>
              </div>
              <div className="flex items-center gap-2 font-sans text-sm text-foreground">
                <User className="w-4 h-4 text-tbb-ink-3" aria-hidden />
                <span>with {booking.builderName}</span>
              </div>
            </dl>

            {booking.description && (
              <p className="font-sans text-sm text-muted-foreground border-t border-tbb-line pt-4">
                {booking.description}
              </p>
            )}

            {/* Deliberately does not promise a calendar invite: a booking
                writes a row and does not create a Google event, so saying
                "check your calendar" would be a claim the system does not
                honour. */}
            <p className="font-sans text-sm text-foreground border-t border-tbb-line pt-4">
              A confirmation is on its way to your inbox, and{" "}
              {booking.builderName} will be in touch with the joining details
              before then.
            </p>
          </div>
        )}

        {prep && (
          <PrepRequirementNotice
            prep={prep}
            footnote={`Send them to ${booking.builderName}, at the address on your confirmation email.`}
          />
        )}

        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground text-center">
          Workplaces · Build what compounds.
        </p>
      </div>
    </main>
  );
}
