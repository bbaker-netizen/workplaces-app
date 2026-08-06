/**
 * "They filled in the assessment" — to the Business Builder who owns them.
 *
 * Distinct from `notifyNewLead`, which alerts the shared inbox and only
 * fires for a genuinely NEW prospect. An assessment usually arrives on a
 * lead that already exists: someone was sent the before-we-meet link
 * because a conversation was already booked. That path fired nothing at
 * all, so the answers landed in the database and the person about to walk
 * into the meeting was never told.
 *
 * Ownership decides the recipient, using the same rule as every other
 * prospect notification (see `recipientsForProspect`): the owner alone,
 * or the triage inbox when nobody owns it yet. A second Business Builder
 * gets their own prospects' answers, and only their own.
 *
 * Best-effort by design. The submission is already stored by the time
 * this runs; a mail failure must not fail the webhook and cost the lead.
 */

import { withSystemContext } from "@/lib/db/tenant";
import {
  loadInternalUsers,
  recipientsForProspect,
} from "@/lib/notifications/prospect-recipients";
import { sendEmailQuietly } from "@/lib/email/send";
import { newLeadEmail } from "@/lib/email/templates";

export type NotifyAssessmentInput = {
  prospectId: string;
  orgId: string;
  /** Null for a brand-new prospect — routes to the triage inbox. */
  ownerUserProfileId: string | null;
  companyName: string;
  contactName: string | null;
  contactEmail: string;
  /** Which tool produced it, for the subject line. */
  toolLabel: string;
  /** One-line verdict — e.g. "Base Camp: People (Cracked)". */
  summary: string | null;
};

export async function notifyAssessmentReceived(
  input: NotifyAssessmentInput,
): Promise<void> {
  try {
    const recipients = await withSystemContext(async (tx) => {
      const internal = await loadInternalUsers(tx, input.orgId);
      return recipientsForProspect(input.ownerUserProfileId, internal);
    });
    if (recipients.length === 0) return;

    for (const r of recipients) {
      await sendEmailQuietly({
        ...newLeadEmail({
          to: r.email,
          companyName: input.companyName,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          phone: null,
          leadSource: input.toolLabel,
          message: input.summary,
          prospectUrl: `/business-builder/pipeline/${input.prospectId}`,
        }),
        // Same reasoning as the new-lead alert: prep for a booked meeting
        // is time-sensitive and should not wait for business hours.
        bypassWorkingHours: true,
      });
    }
  } catch (e) {
    console.error("[notify-assessment] could not alert the owner:", e);
  }
}
