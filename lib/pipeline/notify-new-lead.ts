/**
 * New-lead alert — emails the shared inbox the moment a new prospect is
 * created, so no inbound lead sits unseen.
 *
 * Both intake paths (the Make.com bridge at /api/leads/[token], which carries
 * the website contact form + Meta / Google / etc. ads, and the JSON intake at
 * /api/leads) call this after a NEW prospect row is written. Repeat
 * submissions that only touch an existing prospect do NOT fire it — "new
 * leads, as they come in", not every re-post.
 *
 * Delivery is best-effort and bypasses the working-hours guard: a fresh lead
 * should reach the inbox immediately, day or night, the same way the existing
 * coach alert does. A send failure never blocks the webhook response.
 */

import { sendEmailQuietly } from "@/lib/email/send";
import { newLeadEmail } from "@/lib/email/templates";

/**
 * Where new-lead alerts go. Bruce's shared inbound inbox, overridable via
 * env without a code change. Defaults so the feature works with no setup.
 */
export function leadNotifyEmail(): string {
  const configured = process.env.LEADS_NOTIFY_EMAIL?.trim();
  return configured && configured.length > 0
    ? configured
    : "info@4workplaces.com";
}

export type NotifyNewLeadInput = {
  prospectId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string;
  phone: string | null;
  leadSource: string;
  /** The lead's own words (already extracted for the profile Notes). */
  message: string | null;
};

/**
 * Fire the new-lead alert to the shared inbox. Best-effort — logs on
 * failure, never throws, so it can be awaited inside an intake route
 * without risking the response.
 */
export async function notifyNewLead(input: NotifyNewLeadInput): Promise<void> {
  await sendEmailQuietly({
    ...newLeadEmail({
      to: leadNotifyEmail(),
      companyName: input.companyName,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      phone: input.phone,
      leadSource: input.leadSource,
      message: input.message,
      prospectUrl: `/business-builder/pipeline/${input.prospectId}`,
    }),
    // A new lead shouldn't wait for business hours to surface.
    bypassWorkingHours: true,
  });
}
