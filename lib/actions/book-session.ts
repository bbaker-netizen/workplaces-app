"use server";

/**
 * Client ad-hoc session booking. The client picks an open slot from the
 * cross-Builder availability (see lib/scheduling/availability.ts) and we:
 *   1. create a scheduled bbs_session on their engagement, and
 *   2. best-effort create a Google Calendar event + Meet link on the
 *      chosen Builder's calendar, inviting the Builder and the client.
 *
 * Client roles can call this for their own engagement (gated via
 * withEngagementContext). The session shows in their portal Sessions list
 * and the coach's console; the calendar event is mapped so the calendar
 * sync treats it as existing rather than a duplicate.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { clientWriteBlocked, READ_ONLY_ERROR } from "@/lib/server/engagement-guard";
import {
  bbsSessions,
  engagements,
  googleCalendarEventMappings,
  userProfiles,
} from "@/lib/db/schema";
import { withEngagementContext, withSystemContext } from "@/lib/db/tenant";
import {
  createMeetingWithInvite,
  listExternalEvents,
} from "@/lib/integrations/google-calendar";

const TZ = "America/Edmonton";
const SLOT_MINUTES = 60;

const schema = z.object({
  engagementId: z.string().uuid(),
  startIso: z.string().min(10),
  builderUserProfileId: z.string().uuid(),
});

export type BookResult =
  | { ok: true; data: { sessionId: string } }
  | { ok: false; error: string };

export async function bookAdHocSession(
  input: z.input<typeof schema>,
): Promise<BookResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { engagementId, startIso, builderUserProfileId } = parsed.data;
  // Read-only when the engagement is paused (coaches pass through).
  if (await clientWriteBlocked(profile.role, engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime()))
    return { ok: false, error: "Invalid time." };
  if (start.getTime() < Date.now())
    return { ok: false, error: "That time has already passed." };
  const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);

  // Validate the caller can act on this engagement + grab org/email/name.
  let orgId: string;
  let clientEmail: string | null;
  let engagementName: string | null;
  try {
    const ctx = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        const [eng] = await tx
          .select({ name: engagements.name })
          .from(engagements)
          .where(eq(engagements.id, engagementId))
          .limit(1);
        const [me] = await tx
          .select({ email: userProfiles.email })
          .from(userProfiles)
          .where(eq(userProfiles.id, profile.userProfileId))
          .limit(1);
        return {
          orgId: boundOrgId,
          name: eng?.name ?? null,
          email: me?.email ?? null,
        };
      },
    );
    orgId = ctx.orgId;
    engagementName = ctx.name;
    clientEmail = ctx.email;
  } catch {
    return { ok: false, error: "You can't book for this engagement." };
  }

  const builder = await withSystemContext(async (tx) => {
    const [b] = await tx
      .select({ name: userProfiles.fullName, email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.id, builderUserProfileId))
      .limit(1);
    return b ?? null;
  });
  if (!builder) return { ok: false, error: "Business Builder not found." };

  // Re-check the slot is still free (best-effort; a stale availability
  // view shouldn't silently double-book).
  try {
    const events = await listExternalEvents(builderUserProfileId, start, end);
    const conflict = events.some(
      (e) => start.getTime() < e.end.getTime() && end.getTime() > e.start.getTime(),
    );
    if (conflict)
      return {
        ok: false,
        error: "That time was just taken — please pick another.",
      };
  } catch {
    // Couldn't re-check; proceed and let the coach confirm.
  }

  const sessionId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(bbsSessions)
      .values({
        orgId,
        engagementId,
        scheduledAt: start,
        type: "virtual",
        status: "scheduled",
        notes: "Additional session booked by the client via the portal.",
        createdByUserProfileId: profile.userProfileId,
      })
      .returning({ id: bbsSessions.id });
    return row.id;
  });

  // Best-effort calendar invite + Meet link on the Builder's calendar.
  try {
    const attendees = [
      ...(builder.email ? [{ email: builder.email }] : []),
      ...(clientEmail ? [{ email: clientEmail }] : []),
    ];
    const ev = await createMeetingWithInvite(builderUserProfileId, {
      summary: `${engagementName ?? "Client"} ↔ ${builder.name ?? "Business Builder"} — Session`,
      description:
        "Additional Business Building session booked via The Builder portal.",
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end: { dateTime: end.toISOString(), timeZone: TZ },
      attendees,
      addMeetLink: true,
    });
    await withSystemContext(async (tx) => {
      await tx.insert(googleCalendarEventMappings).values({
        orgId,
        bbsSessionId: sessionId,
        userProfileId: builderUserProfileId,
        googleEventId: ev.eventId,
        googleCalendarId: ev.calendarId,
      });
    });
  } catch (e) {
    console.error("[bookAdHocSession] calendar invite failed:", e);
    // Session is still booked; coach can confirm / send the invite.
  }

  revalidatePath("/portal/sessions");
  revalidatePath(`/business-builder/sessions/${engagementId}`);
  return { ok: true, data: { sessionId } };
}
