"use server";

/**
 * Scheduling — Calendly-style booking.
 *
 * Phase 3.8 minimum: coach-defines availability windows on a
 * scheduling_link, public visitor browses available slots, picks
 * one, books. Booking creates either a prospect (`discovery` link)
 * or a bbs_session (`bbs` link) depending on the link's meeting type.
 *
 * Out of scope for 3.8 (Phase 4):
 * - Google / Outlook calendar sync (free/busy ingest)
 * - Buffer between meetings
 * - Multi-coach / round-robin booking
 * - AI auto-scheduling (Motion-style)
 * - Time-zone conversion for the booker (assumes Mountain Time
 *   matches Bruce's working window)
 */

import { and, eq, gte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  bookings,
  prospects,
  schedulingLinks,
  type UserProfile,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { DateTime } from "luxon";

const TIMEZONE = "America/Edmonton";

type Role = UserProfile["role"];
function canManage(role: Role): boolean {
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* -------------------------- create / edit a link -------------------------- */

const meetingTypeEnum = z.enum(["discovery", "bbs", "ad_hoc"]);

const createLinkSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, and hyphens only."),
  name: z.string().min(1).max(200),
  description: z.string().max(20000).nullable().optional(),
  meetingType: meetingTypeEnum.default("discovery"),
  durationMinutes: z.number().int().min(15).max(240).default(30),
  /** Bitmap of weekdays (Mon=1, Sun=7). Default Mon–Fri. */
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .default([1, 2, 3, 4, 5]),
  /** Day-window in MT minutes-of-day (0–1440). Default 8:30am → 6:00pm. */
  startMinute: z.number().int().min(0).max(1440).default(510),
  endMinute: z.number().int().min(0).max(1440).default(1080),
});

export async function createSchedulingLink(
  input: z.input<typeof createLinkSchema>,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canManage(profile.role))
    return { ok: false, error: "Business Builders only." };
  const parsed = createLinkSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    const created = await withSystemContext(async (tx) => {
      const [row] = await tx
        .insert(schedulingLinks)
        .values({
          orgId: profile.orgId,
          coachUserProfileId: profile.userProfileId,
          slug: data.slug,
          name: data.name,
          description: data.description ?? null,
          meetingType: data.meetingType,
          durationMinutes: data.durationMinutes,
          availability: {
            weekdays: data.weekdays,
            startMinute: data.startMinute,
            endMinute: data.endMinute,
          },
        })
        .returning({ id: schedulingLinks.id, slug: schedulingLinks.slug });
      return row;
    });
    revalidatePath("/coach/scheduling");
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteSchedulingLink(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canManage(profile.role))
    return { ok: false, error: "Business Builders only." };
  try {
    await withSystemContext(async (tx) => {
      await tx.delete(schedulingLinks).where(eq(schedulingLinks.id, id));
    });
    revalidatePath("/coach/scheduling");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* -------------------------- compute available slots -------------------------- */

export type AvailableSlot = {
  startsAt: string; // ISO UTC
  startsAtLocal: string; // pretty MT
};

export async function listAvailableSlots(
  slug: string,
  daysAhead = 14,
): Promise<ActionResult<{ link: { name: string; durationMinutes: number; description: string | null }; slots: AvailableSlot[] }>> {
  const link = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select()
      .from(schedulingLinks)
      .where(eq(schedulingLinks.slug, slug))
      .limit(1);
    return row ?? null;
  });
  if (!link || !link.isActive)
    return { ok: false, error: "Booking link isn't available." };

  const avail = (link.availability as {
    weekdays?: number[];
    startMinute?: number;
    endMinute?: number;
  }) ?? {};
  const weekdays = new Set(avail.weekdays ?? [1, 2, 3, 4, 5]);
  const startMin = avail.startMinute ?? 510;
  const endMin = avail.endMinute ?? 1080;
  const dur = Number(link.durationMinutes);

  const now = DateTime.now().setZone(TIMEZONE);
  const horizon = now.plus({ days: daysAhead });

  // Existing bookings to exclude.
  const existing = await withSystemContext(async (tx) =>
    tx
      .select({ bookedAt: bookings.bookedAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.schedulingLinkId, link.id),
          gte(bookings.bookedAt, now.toJSDate()),
          isNull(bookings.cancelledAt),
        ),
      ),
  );
  const taken = new Set(
    existing.map((b) => new Date(b.bookedAt).getTime()),
  );

  const slots: AvailableSlot[] = [];
  let cursor = now.startOf("day");
  while (cursor < horizon && slots.length < 100) {
    if (weekdays.has(cursor.weekday)) {
      let m = startMin;
      while (m + dur <= endMin) {
        const slot = cursor.set({
          hour: Math.floor(m / 60),
          minute: m % 60,
          second: 0,
          millisecond: 0,
        });
        if (slot > now && !taken.has(slot.toJSDate().getTime())) {
          slots.push({
            startsAt: slot.toUTC().toISO() ?? "",
            startsAtLocal: slot.toFormat(
              "EEE LLL d, h:mm a 'MT'",
            ),
          });
        }
        m += dur;
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  return {
    ok: true,
    data: {
      link: {
        name: link.name,
        durationMinutes: dur,
        description: link.description,
      },
      slots,
    },
  };
}

/* -------------------------- book a slot (public) -------------------------- */

const bookSchema = z.object({
  slug: z.string().min(1),
  startsAtUtc: z.string().datetime(),
  bookerName: z.string().min(1).max(200),
  bookerEmail: z.string().email(),
  bookerCompany: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function createBooking(
  input: z.input<typeof bookSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    const created = await withSystemContext(async (tx) => {
      const [link] = await tx
        .select()
        .from(schedulingLinks)
        .where(eq(schedulingLinks.slug, data.slug))
        .limit(1);
      if (!link || !link.isActive) throw new Error("Booking link unavailable.");

      // Idempotency: if someone else booked this exact slot, fail.
      const startsAt = new Date(data.startsAtUtc);
      const [existing] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.schedulingLinkId, link.id),
            eq(bookings.bookedAt, startsAt),
            isNull(bookings.cancelledAt),
          ),
        )
        .limit(1);
      if (existing) {
        throw new Error("That slot was just taken. Pick another.");
      }

      const bbsSessionId: string | null = null;
      let prospectId: string | null = null;

      if (link.meetingType === "bbs") {
        // BBS bookings don't auto-create until we know which engagement.
        // The Business Builder manually creates the engagement ahead of time and
        // shares the link in context. Phase 4 will allow per-engagement
        // booking links.
      } else if (link.meetingType === "discovery") {
        const [pr] = await tx
          .insert(prospects)
          .values({
            orgId: link.orgId,
            companyName: data.bookerCompany ?? data.bookerName,
            contactName: data.bookerName,
            contactEmail: data.bookerEmail,
            status: "diagnostic_pending",
            notes: data.notes ?? null,
          })
          .returning({ id: prospects.id });
        prospectId = pr.id;
      }

      const [row] = await tx
        .insert(bookings)
        .values({
          orgId: link.orgId,
          schedulingLinkId: link.id,
          bookedAt: startsAt,
          durationMinutes: link.durationMinutes,
          bookerName: data.bookerName,
          bookerEmail: data.bookerEmail,
          bookerCompany: data.bookerCompany ?? null,
          notes: data.notes ?? null,
          bbsSessionId,
          prospectId,
        })
        .returning({ id: bookings.id });
      return row;
    });
    revalidatePath("/coach/scheduling");
    return { ok: true, data: { bookingId: created.id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
