"use server";

/**
 * Import a Google Calendar event into the app as a BBS session (#5).
 *
 * The existing `syncBbsSessionToGoogle` flow pushes app-created sessions
 * OUT to Google. This is the other direction: take an event that already
 * lives on the Business Builder's Google Calendar and pull it IN as a
 * scheduled session for a chosen engagement.
 *
 * Crucially it does NOT call `syncBbsSessionToGoogle` — instead it
 * records a `googleCalendarEventMappings` row pointing at the EXISTING
 * Google event. That links the two without creating a duplicate event,
 * and means later edits to the session update the original calendar
 * entry rather than spawning a second one.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { bbsSessions, googleCalendarEventMappings } from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";
import { getValidAccessToken } from "@/lib/integrations/google-calendar";

const schema = z.object({
  engagementId: z.string().uuid(),
  googleEventId: z.string().min(1),
  startAtIso: z.string().min(1),
  summary: z.string().max(500).optional(),
  type: z.enum(["in_person", "virtual"]),
});

export type ImportSessionResult = { ok: true } | { ok: false; error: string };

export async function importGoogleEventAsSession(input: {
  engagementId: string;
  googleEventId: string;
  startAtIso: string;
  summary?: string;
  type: string;
}): Promise<ImportSessionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "You're not signed in." };
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only Business Builders can import calendar events." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const scheduled = new Date(parsed.data.startAtIso);
  if (Number.isNaN(scheduled.getTime())) {
    return { ok: false, error: "That event's date and time isn't valid." };
  }

  // The calendar id is needed so future edits update the right event.
  const token = await getValidAccessToken(profile.userProfileId);
  const googleCalendarId = token?.calendarId ?? "primary";

  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      parsed.data.engagementId,
      async (tx, boundOrgId) => {
        // Already imported? Don't create a second session.
        const [dupe] = await tx
          .select({ id: googleCalendarEventMappings.id })
          .from(googleCalendarEventMappings)
          .where(
            and(
              eq(googleCalendarEventMappings.googleEventId, parsed.data.googleEventId),
              eq(googleCalendarEventMappings.userProfileId, profile.userProfileId),
            ),
          )
          .limit(1);
        if (dupe) throw new Error("That event is already in the app.");

        const [row] = await tx
          .insert(bbsSessions)
          .values({
            orgId: boundOrgId,
            engagementId: parsed.data.engagementId,
            scheduledAt: scheduled,
            type: parsed.data.type,
            notes: parsed.data.summary
              ? `Imported from Google Calendar: ${parsed.data.summary}`
              : null,
            createdByUserProfileId: profile.userProfileId,
          })
          .returning({ id: bbsSessions.id });

        await tx.insert(googleCalendarEventMappings).values({
          orgId: boundOrgId,
          bbsSessionId: row.id,
          userProfileId: profile.userProfileId,
          googleEventId: parsed.data.googleEventId,
          googleCalendarId,
        });
      },
    );

    revalidatePath("/business-builder/calendar");
    revalidatePath(`/business-builder/sessions/${parsed.data.engagementId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
