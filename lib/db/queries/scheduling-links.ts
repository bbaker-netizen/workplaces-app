/**
 * Booking links, read for the console.
 *
 * `withSystemContext` rather than a tenant binding: scheduling_links live
 * in the master org and every Business Builder reading them is in that
 * org too, so there is no per-client scope to apply — the scoping that
 * matters here is by OWNER, done explicitly below.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { bookings, schedulingLinks, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type SchedulingLinkRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  meetingType: "discovery" | "bbs" | "ad_hoc";
  durationMinutes: number;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  isActive: boolean;
  coachUserProfileId: string;
  coachName: string;
  /** Bookings taken through this link — a link with history can be
   *  retired but not deleted, and the count is what explains why. */
  bookingCount: number;
  upcomingCount: number;
  /** How the last PUBLIC load of this page went. Null throughout means
   *  nobody has opened it since we started recording, which is reported
   *  as "not checked yet" rather than as healthy. */
  lastAvailabilityCheckedAt: Date | null;
  lastAvailabilityOk: boolean | null;
  lastAvailabilityReason: string | null;
  lastAvailabilityError: string | null;
};

export type SchedulingLinksView = {
  links: SchedulingLinkRow[];
  /** Whose links these are. A master admin sees the whole practice's, so
   *  the list has to say who each one belongs to. */
  scope: "mine" | "practice";
};

/**
 * Every link the caller may manage.
 *
 * A coach sees their own. A master_admin sees the practice's — they can
 * create a link on a teammate's behalf, and a link they made for Jen
 * vanishing from their own list the moment it saved would read as the
 * save having failed.
 */
export async function listManageableSchedulingLinks(): Promise<SchedulingLinksView> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { links: [], scope: "mine" };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { links: [], scope: "mine" };

  const isAdmin = profile.role === "master_admin";

  const rows = await withSystemContext(async (tx) =>
    tx
      .select({
        id: schedulingLinks.id,
        slug: schedulingLinks.slug,
        name: schedulingLinks.name,
        description: schedulingLinks.description,
        meetingType: schedulingLinks.meetingType,
        durationMinutes: schedulingLinks.durationMinutes,
        availability: schedulingLinks.availability,
        isActive: schedulingLinks.isActive,
        coachUserProfileId: schedulingLinks.coachUserProfileId,
        coachName: userProfiles.fullName,
        lastAvailabilityCheckedAt: schedulingLinks.lastAvailabilityCheckedAt,
        lastAvailabilityOk: schedulingLinks.lastAvailabilityOk,
        lastAvailabilityReason: schedulingLinks.lastAvailabilityReason,
        lastAvailabilityError: schedulingLinks.lastAvailabilityError,
        bookingCount: sql<number>`(
          select count(*) from ${bookings}
          where ${bookings.schedulingLinkId} = ${schedulingLinks.id}
        )`,
        upcomingCount: sql<number>`(
          select count(*) from ${bookings}
          where ${bookings.schedulingLinkId} = ${schedulingLinks.id}
            and ${bookings.cancelledAt} is null
            and ${bookings.bookedAt} > now()
        )`,
      })
      .from(schedulingLinks)
      .innerJoin(
        userProfiles,
        eq(userProfiles.id, schedulingLinks.coachUserProfileId),
      )
      .where(
        isAdmin
          ? eq(schedulingLinks.orgId, profile.orgId)
          : and(
              eq(schedulingLinks.orgId, profile.orgId),
              eq(
                schedulingLinks.coachUserProfileId,
                profile.userProfileId,
              ),
            ),
      )
      .orderBy(
        desc(schedulingLinks.isActive),
        asc(userProfiles.fullName),
        asc(schedulingLinks.name),
      ),
  );

  return {
    scope: isAdmin ? "practice" : "mine",
    links: rows.map((r) => {
      const a = (r.availability as {
        weekdays?: number[];
        startMinute?: number;
        endMinute?: number;
      }) ?? {};
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        meetingType: r.meetingType,
        durationMinutes: Number(r.durationMinutes),
        weekdays: a.weekdays ?? [1, 2, 3, 4, 5],
        startMinute: a.startMinute ?? 510,
        endMinute: a.endMinute ?? 1080,
        isActive: r.isActive,
        coachUserProfileId: r.coachUserProfileId,
        coachName: r.coachName ?? "(unnamed)",
        // Neon returns count() as a string; every arithmetic or
        // comparison use of it needs the explicit Number().
        bookingCount: Number(r.bookingCount ?? 0),
        upcomingCount: Number(r.upcomingCount ?? 0),
        lastAvailabilityCheckedAt: r.lastAvailabilityCheckedAt ?? null,
        lastAvailabilityOk: r.lastAvailabilityOk ?? null,
        lastAvailabilityReason: r.lastAvailabilityReason ?? null,
        lastAvailabilityError: r.lastAvailabilityError ?? null,
      };
    }),
  };
}
