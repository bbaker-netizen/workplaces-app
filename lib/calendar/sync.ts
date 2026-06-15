/**
 * Automatic Google Calendar → BBS sessions sync.
 *
 * For each Business Builder who has connected Google Calendar, we read
 * their upcoming events and turn the ones that involve a client into
 * scheduled sessions in that client's portal. Matching is by attendee
 * email: if a calendar event has an attendee whose email belongs to a
 * member (or the originating prospect contact) of one of the coach's
 * active engagements, the event becomes a session for that engagement.
 *
 * Idempotent via `google_calendar_event_mappings` (one row per
 * event+user): an event already mapped is updated in place rather than
 * duplicated. Sessions created in-app and pushed OUT to Google are
 * already mapped, so they're treated as updates here too — never
 * re-created. This is the inbound counterpart to the manual
 * `importGoogleEventAsSession` action.
 *
 * Cross-tenant by nature (events live on the coach's calendar; sessions
 * land in client orgs), so everything runs in `withSystemContext`.
 */

import { and, eq, isNull } from "drizzle-orm";
import {
  bbsSessions,
  coaches,
  engagements,
  googleCalendarEventMappings,
  googleCalendarTokens,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  getValidAccessToken,
  listEventsForSync,
} from "@/lib/integrations/google-calendar";

export type CalendarSyncResult = {
  created: number;
  updated: number;
  cancelled: number;
  skipped: boolean;
  reason?: string;
};

/** How far ahead to pull events. Two-touch-a-month BBS rhythm × a few
 *  months of lookahead is plenty. */
const WINDOW_DAYS = 120;

const EMPTY = (reason: string): CalendarSyncResult => ({
  created: 0,
  updated: 0,
  cancelled: 0,
  skipped: true,
  reason,
});

/**
 * Sync one coach's calendar into sessions. Returns counts of what
 * changed. Safe to run repeatedly.
 */
export async function syncCoachCalendar(
  userProfileId: string,
): Promise<CalendarSyncResult> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) return EMPTY("not-connected");

  // Build a lowercased email → engagement map across this coach's active
  // engagements (their members + the originating prospect contact).
  const emailMap = await withSystemContext(async (tx) => {
    const [coach] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.userProfileId, userProfileId))
      .limit(1);
    if (!coach) return null;

    const engs = await tx
      .select({ id: engagements.id, orgId: engagements.orgId })
      .from(engagements)
      .where(
        and(eq(engagements.coachId, coach.id), isNull(engagements.archivedAt)),
      );

    const map = new Map<string, { engagementId: string; orgId: string }>();
    for (const e of engs) {
      const members = await tx
        .select({ email: userProfiles.email })
        .from(userProfiles)
        .where(eq(userProfiles.orgId, e.orgId));
      for (const m of members) {
        const key = m.email.toLowerCase();
        if (key && !map.has(key))
          map.set(key, { engagementId: e.id, orgId: e.orgId });
      }
      const [pros] = await tx
        .select({ email: prospects.contactEmail })
        .from(prospects)
        .where(eq(prospects.convertedEngagementId, e.id))
        .limit(1);
      if (pros?.email) {
        const key = pros.email.toLowerCase();
        if (!map.has(key))
          map.set(key, { engagementId: e.id, orgId: e.orgId });
      }
    }
    return map;
  });

  if (!emailMap) return EMPTY("not-a-coach");
  if (emailMap.size === 0) return EMPTY("no-engagements");

  const now = new Date();
  const end = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const events = await listEventsForSync(token.token, token.calendarId, now, end);

  let created = 0;
  let updated = 0;
  let cancelled = 0;

  await withSystemContext(async (tx) => {
    for (const ev of events) {
      const [existing] = await tx
        .select({
          id: googleCalendarEventMappings.id,
          bbsSessionId: googleCalendarEventMappings.bbsSessionId,
        })
        .from(googleCalendarEventMappings)
        .where(
          and(
            eq(googleCalendarEventMappings.googleEventId, ev.id),
            eq(googleCalendarEventMappings.userProfileId, userProfileId),
          ),
        )
        .limit(1);

      // Cancelled in Google → cancel the mapped session (only if it's
      // still scheduled; don't disturb completed ones).
      if (ev.status === "cancelled") {
        if (existing) {
          const res = await tx
            .update(bbsSessions)
            .set({ status: "cancelled" })
            .where(
              and(
                eq(bbsSessions.id, existing.bbsSessionId),
                eq(bbsSessions.status, "scheduled"),
              ),
            )
            .returning({ id: bbsSessions.id });
          if (res.length) cancelled++;
        }
        continue;
      }

      const match = ev.attendeeEmails
        .map((e) => emailMap.get(e))
        .find((x): x is { engagementId: string; orgId: string } => Boolean(x));
      // No client attendee → not a session; leave it (and any prior
      // mapping) untouched.
      if (!match) continue;

      if (existing) {
        // Keep the time in step with Google; preserve the coach's chosen
        // type/status so a re-sync never clobbers their edits.
        const res = await tx
          .update(bbsSessions)
          .set({ scheduledAt: ev.start })
          .where(
            and(
              eq(bbsSessions.id, existing.bbsSessionId),
              eq(bbsSessions.status, "scheduled"),
            ),
          )
          .returning({ id: bbsSessions.id });
        if (res.length) updated++;
      } else {
        const [row] = await tx
          .insert(bbsSessions)
          .values({
            orgId: match.orgId,
            engagementId: match.engagementId,
            scheduledAt: ev.start,
            type: ev.isVirtual ? "virtual" : "in_person",
            notes: `Synced from Google Calendar: ${ev.summary}`,
            createdByUserProfileId: userProfileId,
          })
          .returning({ id: bbsSessions.id });
        await tx.insert(googleCalendarEventMappings).values({
          orgId: match.orgId,
          bbsSessionId: row.id,
          userProfileId,
          googleEventId: ev.id,
          googleCalendarId: token.calendarId,
        });
        created++;
      }
    }
  });

  return { created, updated, cancelled, skipped: false };
}

/**
 * Sync every connected Business Builder's calendar. Used by the
 * scheduled Inngest job. One coach failing doesn't stop the others.
 */
export async function syncAllConnectedCalendars(): Promise<{
  coaches: number;
  created: number;
  updated: number;
  cancelled: number;
}> {
  const ids = await withSystemContext(async (tx) =>
    tx
      .select({ id: googleCalendarTokens.userProfileId })
      .from(googleCalendarTokens),
  );

  let created = 0;
  let updated = 0;
  let cancelled = 0;
  for (const { id } of ids) {
    try {
      const r = await syncCoachCalendar(id);
      created += r.created;
      updated += r.updated;
      cancelled += r.cancelled;
    } catch (e) {
      console.error("[calendar-sync] coach", id, "failed:", e);
    }
  }
  return { coaches: ids.length, created, updated, cancelled };
}
