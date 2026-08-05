/**
 * Telling the client a session recording is theirs to read.
 *
 * Releasing a transcript wrote `transcript_shared_at` and told nobody.
 * The client had to happen to open the portal, happen to reach Meeting
 * notes, and happen to expand the right session — for something a
 * Business Builder deliberately decided to hand them. Which meant that
 * in practice the release was invisible.
 *
 * **Who is told is narrower than who can read it.** A released
 * transcript is visible to every role in the engagement, employees
 * included, per Bruce's 2026-08-03 decision. The EMAIL goes only to
 * client leads and managers — same rule as the session recap, and for
 * the same reason: a full verbatim transcript landing unbidden in a
 * junior employee's inbox is a different thing from one the client lead
 * expects. They can still read it in the portal.
 *
 * Working hours are honoured, not bypassed. This is client-facing mail
 * with nothing urgent about it, and since migration 0117 the guard
 * defers rather than drops — so a transcript released on Saturday
 * reaches them on Monday morning instead of never.
 *
 * NO `"use server"` directive: writes notifications and sends mail with
 * no authorization of its own; the calling server action is the gate.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  engagementMeetings,
  engagements,
  notifications,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { transcriptReleasedEmail } from "@/lib/email/templates";

/**
 * Best-effort throughout. Runs after the release is committed, and a
 * mail failure must never unwind a decision correctly recorded.
 */
export async function notifyClientTranscriptReleased(
  meetingId: string,
): Promise<void> {
  try {
    const ctx = await withSystemContext(async (tx) => {
      const [m] = await tx
        .select({
          id: engagementMeetings.id,
          title: engagementMeetings.title,
          occurredAt: engagementMeetings.occurredAt,
          engagementId: engagementMeetings.engagementId,
          orgId: engagementMeetings.orgId,
        })
        .from(engagementMeetings)
        .where(eq(engagementMeetings.id, meetingId))
        .limit(1);
      if (!m) return null;

      const [eng] = await tx
        .select({ name: engagements.name, orgId: engagements.orgId })
        .from(engagements)
        .where(eq(engagements.id, m.engagementId))
        .limit(1);
      if (!eng) return null;

      const contacts = await tx
        .select({
          id: userProfiles.id,
          email: userProfiles.email,
          fullName: userProfiles.fullName,
        })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.orgId, eng.orgId),
            inArray(userProfiles.role, ["client_lead", "client_manager"]),
          ),
        );

      const recipients = contacts.filter((c) => c.email?.includes("@"));
      if (recipients.length > 0) {
        await tx.insert(notifications).values(
          recipients.map((c) => ({
            // The recipient's own org — which here IS the client's, but
            // written from the row rather than assumed, so this keeps
            // working if a Builder is ever a contact.
            orgId: eng.orgId,
            userProfileId: c.id,
            type: "document" as const,
            parentEntityType: "meeting_transcript",
            parentEntityId: m.id,
            sentVia: "both" as const,
          })),
        );
      }
      return { meeting: m, engagementName: eng.name, recipients };
    });

    if (!ctx || ctx.recipients.length === 0) return;

    for (const c of ctx.recipients) {
      await sendEmailQuietly({
        ...transcriptReleasedEmail({
          to: c.email,
          recipientName: c.fullName,
          meetingTitle: ctx.meeting.title,
          occurredAt: ctx.meeting.occurredAt,
          engagementName: ctx.engagementName,
        }),
        purpose: "transcript_released",
      });
    }
  } catch (e) {
    console.error("[transcripts] release notification failed", meetingId, e);
  }
}
