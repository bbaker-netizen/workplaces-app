/**
 * "Someone booked" — to the visitor, and to the Business Builder.
 *
 * A booking through /book used to send NOTHING. Verified against Gmail
 * for a real booking at 08:21 MT on 7 Aug: a `bookings` row, a prospect
 * row, and not one email to either side. The visitor was left with a
 * screen and no record, and the Builder whose half hour had just gone
 * found out by opening the console.
 *
 * Both messages are best-effort and are sent AFTER the booking has
 * committed. A mail failure must never roll back a booking that the
 * visitor has already been told about — the time is genuinely held, and
 * an unsent confirmation is a smaller problem than a lost slot.
 *
 * Both BYPASS the working-hours window, deliberately. `sendEmail` DROPS
 * an out-of-hours message rather than queueing it, so without the bypass
 * a booking made at 8pm — which is exactly when people book — would reach
 * nobody, ever. And a confirmation that arrives the next morning is not a
 * confirmation; the visitor has already decided we are broken.
 */

import { withSystemContext } from "@/lib/db/tenant";
import {
  loadInternalUsers,
  recipientsForProspect,
} from "@/lib/notifications/prospect-recipients";
import { sendEmailQuietly } from "@/lib/email/send";
import {
  bookingConfirmationEmail,
  bookingReceivedEmail,
} from "@/lib/email/templates";

export type BookingNotifyInput = {
  orgId: string;
  /** The link's coach. Owns the lead, so owns the alert. */
  coachUserProfileId: string;
  builderName: string;
  /** Where the visitor should write to reschedule. */
  builderEmail: string | null;
  meetingName: string;
  description: string | null;
  /** Pre-formatted Mountain Time — the same string the visitor saw. */
  whenLocal: string;
  durationMinutes: number;
  bookerName: string;
  bookerEmail: string;
  bookerCompany: string | null;
  notes: string | null;
  /** Null for link types that create no lead (bbs / ad_hoc). */
  prospectId: string | null;
};

/**
 * Fire both messages. Never throws; logs and moves on.
 *
 * The two sends are independent on purpose: if the visitor's address
 * bounces, the Builder must still hear that their time is gone.
 */
export async function notifyBooking(input: BookingNotifyInput): Promise<void> {
  const shared = {
    builderName: input.builderName,
    builderEmail: input.builderEmail,
    meetingName: input.meetingName,
    whenLocal: input.whenLocal,
    durationMinutes: input.durationMinutes,
    bookerName: input.bookerName,
    bookerEmail: input.bookerEmail,
    bookerCompany: input.bookerCompany,
    notes: input.notes,
    description: input.description,
  };

  try {
    await sendEmailQuietly({
      ...bookingConfirmationEmail({ ...shared, to: input.bookerEmail }),
      bypassWorkingHours: true,
      purpose: "booking-confirmation",
    });
  } catch (e) {
    console.error("[booking] confirmation to the booker failed:", e);
  }

  try {
    // Same rule as every other prospect notification: the owner alone, or
    // the triage inbox when nobody owns it. The link's coach IS the owner
    // of any lead this booking created (`createBooking` stamps them), so
    // routing through the shared rule rather than emailing the coach
    // directly keeps this consistent with the assessment and gone-quiet
    // alerts — and keeps one Builder out of the other's inbox.
    const recipients = await withSystemContext(async (tx) => {
      const internal = await loadInternalUsers(tx, input.orgId);
      return recipientsForProspect(input.coachUserProfileId, internal);
    });
    if (recipients.length === 0) {
      console.error(
        `[booking] no internal recipient resolved for org ${input.orgId} — nobody was told about ${input.bookerEmail}'s booking`,
      );
      return;
    }
    for (const r of recipients) {
      await sendEmailQuietly({
        ...bookingReceivedEmail({
          ...shared,
          to: r.email,
          prospectUrl: input.prospectId
            ? `/business-builder/pipeline/${input.prospectId}`
            : null,
        }),
        bypassWorkingHours: true,
        purpose: "booking-received",
      });
    }
  } catch (e) {
    console.error("[booking] alert to the Business Builder failed:", e);
  }
}
