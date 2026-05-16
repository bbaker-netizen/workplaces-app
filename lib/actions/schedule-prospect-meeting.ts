"use server";

/**
 * Schedule a meeting with a prospect (or active engagement contact).
 *
 * Creates a Google Calendar event with the contact as an attendee,
 * which Google automatically emails as a real calendar invite (.ics
 * file + accept/decline buttons in their email client). Optionally
 * adds a Google Meet link for video meetings.
 *
 * Also writes to:
 *   - prospect_activities ("Meeting scheduled: ...")
 *   - client_communications (outbound email — the calendar invite)
 *   - prospects.next_action_date / next_action_note
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  clientCommunications,
  prospectActivities,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import { createMeetingWithInvite } from "@/lib/integrations/google-calendar";

const schema = z.object({
  prospectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  /** ISO datetime in the user's local browser timezone. */
  startAt: z.string().min(1),
  durationMinutes: z.number().int().min(5).max(480),
  meetingType: z.enum(["video", "in_person", "phone"]),
  location: z.string().max(500).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  recurrence: z
    .enum(["none", "weekly", "biweekly", "monthly"])
    .optional()
    .default("none"),
});

function recurrenceToRRule(
  recurrence: "none" | "weekly" | "biweekly" | "monthly",
): string[] {
  // Google Calendar's recurrence field is an array of RFC-5545 RRULE
  // strings. We default to "no end" — most coaching cadences are open-
  // ended; the user can edit the series in Google Calendar to cap it.
  switch (recurrence) {
    case "weekly":
      return ["RRULE:FREQ=WEEKLY"];
    case "biweekly":
      return ["RRULE:FREQ=WEEKLY;INTERVAL=2"];
    case "monthly":
      return ["RRULE:FREQ=MONTHLY"];
    case "none":
    default:
      return [];
  }
}

export type ScheduleProspectMeetingInput = z.input<typeof schema>;

export async function scheduleProspectMeeting(
  input: ScheduleProspectMeetingInput,
): Promise<
  | {
      ok: true;
      data: { hangoutLink: string | null; htmlLink: string | null };
    }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;
  const startAt = new Date(data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return { ok: false, error: "That date and time isn't valid." };
  }
  const endAt = new Date(startAt.getTime() + data.durationMinutes * 60_000);

  // Look up prospect + sender.
  const prospect = await withSystemContext(async (tx) => {
    const [p] = await tx
      .select({
        id: prospects.id,
        orgId: prospects.orgId,
        companyName: prospects.companyName,
        contactName: prospects.contactName,
        contactEmail: prospects.contactEmail,
      })
      .from(prospects)
      .where(eq(prospects.id, data.prospectId))
      .limit(1);
    return p ?? null;
  });
  if (!prospect) return { ok: false, error: "Prospect not found." };

  const sender = await withSystemContext(async (tx) => {
    const [u] = await tx
      .select({ name: userProfiles.fullName, email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.id, profile.userProfileId))
      .limit(1);
    return u ?? null;
  });
  if (!sender) return { ok: false, error: "Sender profile not found." };

  // Push to Google Calendar — invite + optional Meet link.
  let calendarResult: {
    hangoutLink: string | null;
    htmlLink: string | null;
  };
  try {
    const r = await createMeetingWithInvite(profile.userProfileId, {
      summary: data.title,
      description: data.description ?? "",
      location:
        data.meetingType === "in_person"
          ? data.location ?? ""
          : data.meetingType === "phone"
            ? data.location ?? "Phone"
            : undefined,
      start: { dateTime: startAt.toISOString(), timeZone: "America/Edmonton" },
      end: { dateTime: endAt.toISOString(), timeZone: "America/Edmonton" },
      attendees: [
        {
          email: prospect.contactEmail,
          displayName: prospect.contactName ?? prospect.companyName,
        },
        { email: sender.email, displayName: sender.name },
      ],
      addMeetLink: data.meetingType === "video",
      recurrence: recurrenceToRRule(data.recurrence),
    });
    calendarResult = { hangoutLink: r.hangoutLink, htmlLink: r.htmlLink };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Couldn't reach Google Calendar: ${e.message}`
          : "Couldn't reach Google Calendar.",
    };
  }

  // Log activity + communication + update next-action.
  try {
    await withTenantContext(prospect.orgId, async (tx) => {
      const meetingTypeLabel =
        data.meetingType === "video"
          ? "Video call"
          : data.meetingType === "phone"
            ? "Phone call"
            : "In person";
      const bodyLines = [
        `Type: ${meetingTypeLabel}`,
        `When: ${startAt.toLocaleString("en-CA", {
          timeZone: "America/Edmonton",
          dateStyle: "full",
          timeStyle: "short",
        })} (${data.durationMinutes} min)`,
      ];
      if (calendarResult.hangoutLink) {
        bodyLines.push(`Google Meet: ${calendarResult.hangoutLink}`);
      }
      if (data.location && data.meetingType !== "video") {
        bodyLines.push(`Location: ${data.location}`);
      }
      if (data.description) {
        bodyLines.push("", data.description);
      }
      const body = bodyLines.join("\n");

      await tx.insert(prospectActivities).values({
        prospectId: prospect.id,
        orgId: prospect.orgId,
        type: "meeting",
        subject: data.title,
        body,
        occurredAt: startAt,
        createdByUserProfileId: profile.userProfileId,
      });

      await tx.insert(clientCommunications).values({
        orgId: prospect.orgId,
        prospectId: prospect.id,
        channel: "email",
        direction: "outbound",
        fromAddress: sender.email,
        toAddresses: [prospect.contactEmail],
        subject: `Calendar invite: ${data.title}`,
        body,
        occurredAt: new Date(),
        createdByUserProfileId: profile.userProfileId,
      });

      // Set next action date + a one-line note so the pipeline list
      // shows "Mar 5 — Discovery call" without the user having to type
      // it manually.
      await tx
        .update(prospects)
        .set({
          nextActionDate: startAt,
          nextActionNote: data.title,
          updatedAt: new Date(),
        })
        .where(eq(prospects.id, prospect.id));
    });
  } catch (e) {
    console.error("[schedule-prospect-meeting] activity write failed:", e);
    // Calendar event was created; logging hiccup isn't user-fatal.
  }

  revalidatePath(`/coach/pipeline/${prospect.id}`);
  revalidatePath("/coach/pipeline");
  revalidatePath("/coach/inbox");
  return { ok: true, data: calendarResult };
}
