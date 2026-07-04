"use server";

/**
 * Start a recorded session with a prospect / client — Fireflies "Option A".
 *
 * Fireflies has no generic "record now" API; it records by JOINING a
 * meeting. So we create a Google Calendar event starting now with a
 * Google Meet link and invite the Fireflies notetaker (fred@fireflies.ai)
 * as a guest. Fireflies (connected to the coach's Google account) joins
 * the Meet within ~a minute and records it; the existing Fireflies sync
 * later pulls the transcript and drafts action items.
 *
 * Returns the Meet link for the coach to click and join.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { prospectActivities, prospects, userProfiles } from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import { createMeetingWithInvite } from "@/lib/integrations/google-calendar";

/** The Fireflies notetaker guest address — inviting it makes Fireflies
 *  join and record the meeting. */
const FIREFLIES_NOTETAKER_EMAIL = "fred@fireflies.ai";

const schema = z.object({
  prospectId: z.string().uuid(),
  /** Whether to also invite the client contact. Off = a quiet recorded
   *  room the coach joins (e.g. an in-person session captured via Meet). */
  inviteContact: z.boolean().optional().default(true),
  durationMinutes: z.number().int().min(15).max(240).optional().default(60),
});

export type StartRecordedSessionInput = z.input<typeof schema>;

export async function startRecordedSession(
  input: StartRecordedSessionInput,
): Promise<
  | { ok: true; data: { meetLink: string | null; htmlLink: string | null } }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { prospectId, inviteContact, durationMinutes } = parsed.data;

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
      .where(eq(prospects.id, prospectId))
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

  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  const attendees: { email: string; displayName?: string }[] = [
    { email: sender.email, displayName: sender.name },
    { email: FIREFLIES_NOTETAKER_EMAIL, displayName: "Fireflies Notetaker" },
  ];
  if (inviteContact && prospect.contactEmail) {
    attendees.splice(1, 0, {
      email: prospect.contactEmail,
      displayName: prospect.contactName ?? prospect.companyName,
    });
  }

  let meetLink: string | null = null;
  let htmlLink: string | null = null;
  try {
    const r = await createMeetingWithInvite(profile.userProfileId, {
      summary: `Recorded session — ${prospect.companyName}`,
      description:
        "Recorded via Fireflies. The Fireflies notetaker will join and " +
        "capture the transcript; action items are drafted afterward.",
      start: { dateTime: startAt.toISOString(), timeZone: "America/Edmonton" },
      end: { dateTime: endAt.toISOString(), timeZone: "America/Edmonton" },
      attendees,
      addMeetLink: true,
      recurrence: [],
      attachments: [],
    });
    meetLink = r.hangoutLink;
    htmlLink = r.htmlLink;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[start-recorded-session] calendar error:", raw);
    const lower = raw.toLowerCase();
    if (
      lower.includes("not connected") ||
      lower.includes("no token") ||
      lower.includes("invalid_grant") ||
      lower.includes("401")
    ) {
      return {
        ok: false,
        error:
          "Google isn't connected (needed to create the Meet). Reconnect at /business-builder/profile/google-calendar and try again.",
      };
    }
    return { ok: false, error: `Couldn't start the session: ${raw}`.slice(0, 200) };
  }

  if (!meetLink) {
    return {
      ok: false,
      error:
        "The meeting was created but Google didn't return a Meet link. Try again, or check the event in Google Calendar.",
    };
  }

  // Log it on the timeline so there's a record the session was started.
  try {
    await withTenantContext(prospect.orgId, async (tx) => {
      await tx.insert(prospectActivities).values({
        prospectId: prospect.id,
        orgId: prospect.orgId,
        type: "meeting",
        subject: "Recorded session started",
        body:
          `Google Meet: ${meetLink}\n` +
          `Fireflies notetaker invited — it will join and record.`,
        occurredAt: startAt,
        createdByUserProfileId: profile.userProfileId,
      });
    });
  } catch (e) {
    console.error("[start-recorded-session] activity write failed:", e);
  }

  revalidatePath(`/business-builder/pipeline/${prospect.id}`);
  return { ok: true, data: { meetLink, htmlLink } };
}
