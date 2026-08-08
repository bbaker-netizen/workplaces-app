"use server";

/**
 * Scheduling — Calendly-style booking.
 *
 * Phase 3.8 minimum: Coach-defines availability windows on a
 * scheduling_link, public visitor browses available slots, picks
 * one, books. Booking creates either a prospect (`discovery` link)
 * or a bbs_session (`bbs` link) depending on the link's meeting type.
 *
 * Out of scope for 3.8 (Phase 4):
 * - Google / Outlook calendar sync (free/busy ingest)
 * - Buffer between meetings
 * - Multi-Coach / round-robin booking
 * - AI auto-scheduling (Motion-style)
 * - Time-zone conversion for the booker (assumes Mountain Time
 *   matches Bruce's working window)
 */

import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  bookings,
  prospects,
  schedulingLinks,
  userProfiles,
  type UserProfile,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { recordBookingAttempt } from "@/lib/booking/attempts";
import { formatSlotLocal } from "@/lib/booking/format";
import { notifyBooking } from "@/lib/booking/notify";
import { LEAD_SOURCE_CHANNELS } from "@/lib/pipeline/lead-source";
import {
  getBuilderBusy,
  overlaps,
  type BusyInterval,
} from "@/lib/scheduling/availability";
import { DateTime } from "luxon";

const TIMEZONE = "America/Edmonton";

type Role = UserProfile["role"];
function canManage(role: Role): boolean {
  return role === "master_admin" || role === "coach";
}

/**
 * Slugs are globally UNIQUE on the table, so a collision is the one
 * failure a Business Builder will actually hit — "discovery" is the
 * obvious name and the second person to reach for it loses. Postgres
 * answers with `duplicate key value violates unique constraint
 * "scheduling_links_slug_unique"`, which is not a sentence to put in
 * front of a coach. Checked before the insert AND caught after it: the
 * pre-check gives the good message, the catch covers the race between
 * two people typing the same slug at once.
 */
const SLUG_TAKEN = "That web address is already in use. Try another.";

function isSlugConflict(e: unknown): boolean {
  const s = e instanceof Error ? e.message : String(e);
  return /duplicate key|unique constraint/i.test(s) && /slug/i.test(s);
}

/**
 * An availability window narrower than the meeting itself produces a link
 * that renders zero slots for ever, and nothing on the public page says
 * why — it just looks broken to the prospect. Refused at the boundary.
 */
function availabilityProblem(input: {
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
}): string | null {
  if (input.weekdays.length === 0)
    return "Pick at least one day of the week.";
  if (input.endMinute <= input.startMinute)
    return "The end of the day has to be after the start.";
  if (input.endMinute - input.startMinute < input.durationMinutes)
    return "The daily window is shorter than the meeting, so no times would ever show. Widen it or shorten the meeting.";
  return null;
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
  isActive: z.boolean().default(true),
  /**
   * Whose link this is. Omitted, it is the caller's own. A master_admin
   * may name another Business Builder — someone has to be able to set a
   * teammate up before that teammate has ever signed in, and the link
   * decides who a booked prospect belongs to (`createBooking` stamps the
   * link's coach as the lead's owner), so getting it wrong routes their
   * leads to the wrong person.
   */
  coachUserProfileId: z.string().uuid().nullable().optional(),
});

/**
 * Resolve the owner for a link the caller is creating or moving.
 *
 * Only a master_admin may name someone else, and only a Business Builder
 * in the caller's own org may be named — without that second check an
 * arbitrary user_profiles id would insert happily and hand a CLIENT a
 * booking link that claims prospects in their name.
 */
async function resolveOwner(
  callerRole: Role,
  callerOrgId: string,
  callerUserProfileId: string,
  requested: string | null | undefined,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!requested || requested === callerUserProfileId)
    return { ok: true, id: callerUserProfileId };
  if (callerRole !== "master_admin")
    return {
      ok: false,
      error: "Only a master admin can create a link for someone else.",
    };
  const [target] = await withSystemContext((tx) =>
    tx
      .select({ id: userProfiles.id, role: userProfiles.role })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.id, requested),
          eq(userProfiles.orgId, callerOrgId),
        ),
      )
      .limit(1),
  );
  if (!target || !canManage(target.role))
    return { ok: false, error: "That isn't a Business Builder on this account." };
  return { ok: true, id: target.id };
}

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
  const problem = availabilityProblem(data);
  if (problem) return { ok: false, error: problem };

  const owner = await resolveOwner(
    profile.role,
    profile.orgId,
    profile.userProfileId,
    data.coachUserProfileId,
  );
  if (!owner.ok) return owner;

  try {
    const created = await withSystemContext(async (tx) => {
      const [clash] = await tx
        .select({ id: schedulingLinks.id })
        .from(schedulingLinks)
        .where(eq(schedulingLinks.slug, data.slug))
        .limit(1);
      if (clash) throw new Error(SLUG_TAKEN);

      const [row] = await tx
        .insert(schedulingLinks)
        .values({
          orgId: profile.orgId,
          coachUserProfileId: owner.id,
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
          isActive: data.isActive,
        })
        .returning({ id: schedulingLinks.id, slug: schedulingLinks.slug });
      return row;
    });
    revalidatePath("/business-builder/scheduling");
    revalidatePath("/book");
    return { ok: true, data: created };
  } catch (e) {
    if (isSlugConflict(e)) return { ok: false, error: SLUG_TAKEN };
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const updateLinkSchema = createLinkSchema.partial().extend({
  id: z.string().uuid(),
});

/**
 * A Business Builder owns their own links; a master_admin may edit any of
 * them. Without this, every coach could edit or delete every other
 * coach's booking page by id — the console lists those ids.
 */
async function loadManageableLink(
  id: string,
  profile: { role: Role; orgId: string; userProfileId: string },
): Promise<
  | { ok: true; link: { id: string; coachUserProfileId: string; availability: unknown; durationMinutes: number } }
  | { ok: false; error: string }
> {
  const [link] = await withSystemContext((tx) =>
    tx
      .select({
        id: schedulingLinks.id,
        coachUserProfileId: schedulingLinks.coachUserProfileId,
        availability: schedulingLinks.availability,
        durationMinutes: schedulingLinks.durationMinutes,
        orgId: schedulingLinks.orgId,
      })
      .from(schedulingLinks)
      .where(eq(schedulingLinks.id, id))
      .limit(1),
  );
  if (!link || link.orgId !== profile.orgId)
    return { ok: false, error: "That booking link no longer exists." };
  if (
    profile.role !== "master_admin" &&
    link.coachUserProfileId !== profile.userProfileId
  )
    return { ok: false, error: "That booking link belongs to someone else." };
  return { ok: true, link };
}

export async function updateSchedulingLink(
  input: z.input<typeof updateLinkSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canManage(profile.role))
    return { ok: false, error: "Business Builders only." };
  const parsed = updateLinkSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;

  const found = await loadManageableLink(data.id, profile);
  if (!found.ok) return found;

  // Availability is validated against the WHOLE window after the edit is
  // applied, not against the fields that happen to be in this payload —
  // lengthening the meeting alone can be what makes the window too short.
  const current = (found.link.availability as {
    weekdays?: number[];
    startMinute?: number;
    endMinute?: number;
  }) ?? {};
  const merged = {
    weekdays: data.weekdays ?? current.weekdays ?? [1, 2, 3, 4, 5],
    startMinute: data.startMinute ?? current.startMinute ?? 510,
    endMinute: data.endMinute ?? current.endMinute ?? 1080,
    durationMinutes:
      data.durationMinutes ?? Number(found.link.durationMinutes),
  };
  const problem = availabilityProblem(merged);
  if (problem) return { ok: false, error: problem };

  let ownerId: string | undefined;
  if (data.coachUserProfileId !== undefined) {
    const owner = await resolveOwner(
      profile.role,
      profile.orgId,
      profile.userProfileId,
      data.coachUserProfileId,
    );
    if (!owner.ok) return owner;
    ownerId = owner.id;
  }

  try {
    await withSystemContext(async (tx) => {
      if (data.slug) {
        const [clash] = await tx
          .select({ id: schedulingLinks.id })
          .from(schedulingLinks)
          .where(
            and(
              eq(schedulingLinks.slug, data.slug),
              ne(schedulingLinks.id, data.id),
            ),
          )
          .limit(1);
        if (clash) throw new Error(SLUG_TAKEN);
      }
      await tx
        .update(schedulingLinks)
        .set({
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined
            ? { description: data.description ?? null }
            : {}),
          ...(data.meetingType !== undefined
            ? { meetingType: data.meetingType }
            : {}),
          ...(data.durationMinutes !== undefined
            ? { durationMinutes: data.durationMinutes }
            : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(ownerId ? { coachUserProfileId: ownerId } : {}),
          availability: {
            weekdays: merged.weekdays,
            startMinute: merged.startMinute,
            endMinute: merged.endMinute,
          },
          updatedAt: new Date(),
        })
        .where(eq(schedulingLinks.id, data.id));
    });
    revalidatePath("/business-builder/scheduling");
    revalidatePath("/book");
    return { ok: true, data: undefined };
  } catch (e) {
    if (isSlugConflict(e)) return { ok: false, error: SLUG_TAKEN };
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
  const found = await loadManageableLink(id, profile);
  if (!found.ok) return found;
  try {
    await withSystemContext(async (tx) => {
      // `bookings.scheduling_link_id` is ON DELETE CASCADE, so deleting a
      // link that has been used takes the record of every meeting booked
      // through it with it. Deactivating retires the link and keeps the
      // history, which is what someone tidying up actually wants.
      const [used] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.schedulingLinkId, id))
        .limit(1);
      if (used)
        throw new Error(
          "Someone has booked through this link, so deleting it would erase those bookings. Turn it off instead.",
        );
      await tx.delete(schedulingLinks).where(eq(schedulingLinks.id, id));
    });
    revalidatePath("/business-builder/scheduling");
    revalidatePath("/book");
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

/**
 * Record how the last PUBLIC read of this link went.
 *
 * Written from the visitor's page load rather than probed from the
 * console, so what a Builder is shown is the outcome a real prospect
 * actually got. A probe run later, from a different function instance
 * with a freshly refreshed token, can easily disagree with what the
 * stranger saw — and the stranger's experience is the thing that
 * matters.
 *
 * Throttled: a write on every pageview would be pure cost, so it only
 * writes when the OUTCOME CHANGED or the last note is over an hour old.
 * That keeps the transition (working → broken) always recorded, which is
 * the event worth having, while a steady state costs one write an hour.
 *
 * Never throws. This is bookkeeping about a booking page; it must not be
 * able to take the booking page down. Same rule as `withHeartbeat`.
 */
async function recordAvailabilityOutcome(
  linkId: string,
  busy: { calendarReadable: boolean; reason: string; error?: string },
): Promise<void> {
  try {
    await withSystemContext(async (tx) => {
      const [prev] = await tx
        .select({
          ok: schedulingLinks.lastAvailabilityOk,
          reason: schedulingLinks.lastAvailabilityReason,
          error: schedulingLinks.lastAvailabilityError,
          at: schedulingLinks.lastAvailabilityCheckedAt,
        })
        .from(schedulingLinks)
        .where(eq(schedulingLinks.id, linkId))
        .limit(1);

      // The error text is part of "did the outcome change", not just the
      // (ok, reason) pair. Keying only on those two meant a page whose
      // reason stayed `calendar-error` while the underlying fault moved
      // on kept reporting the FIRST error for up to an hour — which is
      // exactly what happened while this incident was being traced: the
      // operator-facing text described a fault that had already been
      // replaced by a different one. A stale diagnosis is worse than
      // none, because it is acted on.
      const nextError = busy.error?.slice(0, 2000) ?? null;
      const changed =
        prev?.ok !== busy.calendarReadable ||
        prev?.reason !== busy.reason ||
        (prev?.error ?? null) !== nextError;
      const stale =
        !prev?.at || Date.now() - new Date(prev.at).getTime() > 3_600_000;
      if (!changed && !stale) return;

      await tx
        .update(schedulingLinks)
        .set({
          lastAvailabilityCheckedAt: new Date(),
          lastAvailabilityOk: busy.calendarReadable,
          lastAvailabilityReason: busy.reason,
          // Bounded: a provider can return a very long body, and this is
          // read on a console page, not stored for forensics.
          lastAvailabilityError: nextError,
        })
        .where(eq(schedulingLinks.id, linkId));
    });
  } catch (e) {
    console.error("[availability] could not record link health:", e);
  }
}

export async function listAvailableSlots(
  slug: string,
  daysAhead = 14,
): Promise<
  ActionResult<{
    link: { name: string; durationMinutes: number; description: string | null };
    slots: AvailableSlot[];
    /**
     * False when the Builder's calendar could not be read, so the empty
     * list means "we can't tell" rather than "they are booked solid".
     * Without it those two render identically and a dead Google
     * connection looks like a busy fortnight.
     */
    calendarReadable: boolean;
  }>
> {
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
  const rangeStart = now.toJSDate();
  // To the END of the last day, not to `horizon` itself. The slot loop
  // below walks whole days, so on the final day it emits slots running
  // past the horizon's clock time — and a busy window that stopped at
  // `horizon` would neither fetch the events covering them nor, when the
  // calendar is unreadable, block them. That gap showed up as a lone
  // 17:30 slot surviving on a Builder marked fully busy.
  const rangeEnd = horizon.endOf("day").toJSDate();

  // What the Business Builder is already committed to: their Google
  // Calendar plus any session held in the app. Until this landed the page
  // consulted neither, so every weekday rendered wide open and a visitor
  // could book straight over a client session.
  const busy = await getBuilderBusy(
    link.coachUserProfileId,
    rangeStart,
    rangeEnd,
  );
  await recordAvailabilityOutcome(link.id, busy);

  // Bookings already taken through ANY of this Builder's links, not just
  // this one. A discovery booking creates a prospect and a booking row —
  // it never reaches Google — so a second link on the same calendar was
  // invisible to the first and both could sell the same half hour.
  const existing = await withSystemContext(async (tx) =>
    tx
      .select({
        bookedAt: bookings.bookedAt,
        durationMinutes: bookings.durationMinutes,
      })
      .from(bookings)
      .innerJoin(
        schedulingLinks,
        eq(schedulingLinks.id, bookings.schedulingLinkId),
      )
      .where(
        and(
          eq(schedulingLinks.coachUserProfileId, link.coachUserProfileId),
          // A day back, not `now`: a meeting already under way still
          // blocks the slot that starts ten minutes from now.
          gte(bookings.bookedAt, new Date(rangeStart.getTime() - 86_400_000)),
          isNull(bookings.cancelledAt),
        ),
      ),
  );

  const blocked: BusyInterval[] = [
    ...busy.intervals,
    ...existing.map((b) => {
      const start = new Date(b.bookedAt).getTime();
      return {
        start,
        end: start + Number(b.durationMinutes ?? 0) * 60_000,
      };
    }),
  ];

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
        const slotStartMs = slot.toMillis();
        const slotEndMs = slot.plus({ minutes: dur }).toMillis();
        if (slot > now && !overlaps(slotStartMs, slotEndMs, blocked)) {
          slots.push({
            startsAt: slot.toUTC().toISO() ?? "",
            // Shared formatter — the picker, the confirmation page and
            // both emails must spell the same appointment the same way.
            startsAtLocal: formatSlotLocal(slot.toJSDate()),
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
      calendarReadable: busy.calendarReadable,
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
  // "How did you hear about me?" — required on the public booking form so
  // every booked session carries its acquisition channel. Only consumed
  // when the booking creates a prospect (discovery links).
  source: z.enum(LEAD_SOURCE_CHANNELS),
});

/**
 * The visitor-facing sentence for a failure we could not name.
 *
 * A raw `e.message` here would be a Drizzle statement dump or a Google
 * error body — meaningless to a stranger and a small disclosure besides.
 * The real text goes to `booking_attempts.detail`, where the Builder can
 * read it.
 */
const UNEXPECTED =
  "Something went wrong on our side and the booking didn't go through. Nothing was taken from your calendar. Please try again, or email us and we'll book it by hand.";

/**
 * Book a slot from a public page.
 *
 * TOTAL BY CONSTRUCTION: every path returns an `ActionResult`, and the
 * whole body sits under one catch. This matters more here than anywhere
 * else in the app. A server action that THROWS rejects the promise the
 * browser is awaiting, and the client's `await` inside `startTransition`
 * then rejects with nothing rendered — which is precisely the "three
 * attempts, no booking, no error" a Business Builder hit on 7 Aug. A
 * public booking page must never be able to fail without saying so.
 *
 * Every attempt — booked, refused, or errored — writes a
 * `booking_attempts` row. See migration 0120.
 */
export async function createBooking(
  input: z.input<typeof bookSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  // Best-effort identity for the receipt, read from the RAW input so a
  // row can still be written when validation is what failed.
  const rawSlug =
    typeof (input as { slug?: unknown })?.slug === "string"
      ? ((input as { slug: string }).slug satisfies string)
      : "(unknown)";
  const rawEmail =
    typeof (input as { bookerEmail?: unknown })?.bookerEmail === "string"
      ? (input as { bookerEmail: string }).bookerEmail
      : null;
  const rawName =
    typeof (input as { bookerName?: unknown })?.bookerName === "string"
      ? (input as { bookerName: string }).bookerName
      : null;

  try {
    return await bookSlot(input);
  } catch (e) {
    const detail = e instanceof Error ? e.stack || e.message : String(e);
    console.error("[booking] createBooking threw:", e);
    await recordBookingAttempt({
      slug: rawSlug,
      bookerName: rawName,
      bookerEmail: rawEmail,
      outcome: "error",
      reason: "unhandled",
      detail,
    });
    return { ok: false, error: UNEXPECTED };
  }
}

async function bookSlot(
  input: z.input<typeof bookSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    await recordBookingAttempt({
      slug:
        typeof (input as { slug?: unknown })?.slug === "string"
          ? (input as { slug: string }).slug
          : "(unknown)",
      outcome: "refused",
      reason: "invalid-input",
      detail: `${message} — ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    });
    return { ok: false, error: message };
  }
  const data = parsed.data;
  const requestedStart = new Date(data.startsAtUtc);

  // Loaded once, up front, and reused for the pre-check, the write and
  // the emails. The coach's name is joined here because the confirmation
  // has to tell the visitor who they just booked with.
  const [link] = await withSystemContext((tx) =>
    tx
      .select({
        id: schedulingLinks.id,
        orgId: schedulingLinks.orgId,
        coachUserProfileId: schedulingLinks.coachUserProfileId,
        coachName: userProfiles.fullName,
        coachEmail: userProfiles.email,
        slug: schedulingLinks.slug,
        name: schedulingLinks.name,
        description: schedulingLinks.description,
        meetingType: schedulingLinks.meetingType,
        durationMinutes: schedulingLinks.durationMinutes,
        isActive: schedulingLinks.isActive,
      })
      .from(schedulingLinks)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, schedulingLinks.coachUserProfileId),
      )
      .where(eq(schedulingLinks.slug, data.slug))
      .limit(1),
  );

  const attemptBase = {
    slug: data.slug,
    orgId: link?.orgId ?? null,
    schedulingLinkId: link?.id ?? null,
    requestedStart: Number.isNaN(requestedStart.getTime())
      ? null
      : requestedStart,
    bookerName: data.bookerName,
    bookerEmail: data.bookerEmail,
  };

  /** Say no, on purpose, and leave a record saying which no it was. */
  const refuse = async (
    reason: string,
    message: string,
  ): Promise<ActionResult<{ bookingId: string }>> => {
    await recordBookingAttempt({
      ...attemptBase,
      outcome: "refused",
      reason,
      detail: message,
    });
    return { ok: false, error: message };
  };

  if (!link || !link.isActive)
    return refuse(
      "link-unavailable",
      "This booking page isn't taking bookings right now.",
    );
  if (Number.isNaN(requestedStart.getTime()))
    return refuse("bad-time", "That time isn't valid. Pick another slot.");
  if (requestedStart.getTime() < Date.now())
    return refuse(
      "time-passed",
      "That time has already passed. Pick another slot.",
    );

  const duration = Number(link.durationMinutes ?? 0);
  const requestedEnd = new Date(requestedStart.getTime() + duration * 60_000);

  // Re-check the calendar at the WRITE boundary, not just when the page
  // rendered. Filtering the picker is a courtesy — a tab left open since
  // this morning still holds slots that have since been taken, and it is
  // this call that would put a stranger on top of a client session.
  //
  // Deliberately OUTSIDE the transaction below: a Google round trip
  // inside one pins a pooled Postgres connection for its whole duration.
  const busy = await getBuilderBusy(
    link.coachUserProfileId,
    requestedStart,
    requestedEnd,
  );
  if (
    overlaps(requestedStart.getTime(), requestedEnd.getTime(), busy.intervals)
  ) {
    // Two very different situations, and the visitor deserves to know
    // which. A readable calendar with a clash means "pick another time".
    // An UNREADABLE one means we are refusing every time on this page
    // because we cannot see the Builder's diary — telling that visitor
    // to pick another slot sends them round a loop where nothing will
    // ever work. `getBuilderBusy` fails closed by blocking the whole
    // window, so without this check the two are indistinguishable.
    if (!busy.calendarReadable) {
      return refuse(
        `calendar-unreadable:${busy.reason}`,
        "We can't check the calendar at the moment, so we can't confirm this time. Email us and we'll book it by hand.",
      );
    }
    return refuse(
      "slot-taken",
      "That time is no longer free. Pick another slot.",
    );
  }

  try {
    const created = await withSystemContext(async (tx) => {
      // Idempotency: if someone else booked this exact slot, fail.
      const startsAt = requestedStart;
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
      if (existing) return { taken: true as const };

      const bbsSessionId: string | null = null;
      let prospectId: string | null = null;

      if (link.meetingType === "bbs") {
        // BBS bookings don't auto-create until we know which engagement.
        // The Coach manually creates the engagement ahead of time and
        // shares the link in context. Phase 4 will allow per-engagement
        // booking links.
      } else if (link.meetingType === "discovery") {
        // Match an existing lead on email before creating one. The public
        // intake webhook has always de-duplicated this way; bookings did
        // not, so a lead already in the pipeline who booked a call got a
        // second card and their history split across the two. Archived
        // prospects are ignored so a deliberately archived lead who comes
        // back is a genuinely new one.
        const [existingProspect] = await tx
          .select({
            id: prospects.id,
            ownerUserProfileId: prospects.ownerUserProfileId,
          })
          .from(prospects)
          .where(
            and(
              eq(prospects.orgId, link.orgId),
              isNull(prospects.archivedAt),
              sql`lower(${prospects.contactEmail}) = lower(${data.bookerEmail})`,
            ),
          )
          .limit(1);

        if (existingProspect) {
          await tx
            .update(prospects)
            .set({
              status: "meeting_scheduled",
              bookedSessionAt: new Date(),
              lastContactAt: new Date(),
              // Same rule as the intake webhook: claim it only if nobody
              // owns it. Booking someone else's link must not move a lead
              // off the Business Builder already working them.
              ...(existingProspect.ownerUserProfileId
                ? {}
                : { ownerUserProfileId: link.coachUserProfileId }),
            })
            .where(eq(prospects.id, existingProspect.id));
          prospectId = existingProspect.id;
        } else {
        const [pr] = await tx
          .insert(prospects)
          .values({
            orgId: link.orgId,
            companyName: data.bookerCompany ?? data.bookerName,
            contactName: data.bookerName,
            contactEmail: data.bookerEmail,
            // Whoever's link they booked owns the lead. Ownership drives
            // every downstream notification — the assessment coming back,
            // the gone-quiet nudge, the follow-up due — and an unowned
            // prospect routes to the triage inbox instead, which is how
            // bookings on a second Business Builder's link ended up
            // alerting the master admin and nobody else.
            ownerUserProfileId: link.coachUserProfileId,
            status: "meeting_scheduled",
            leadSource: "Discovery booking",
            source: data.source,
            firstSeenAt: new Date(),
            // They just booked — stamp the booked-session attribution date.
            bookedSessionAt: new Date(),
            notes: data.notes ?? null,
          })
          .returning({ id: prospects.id });
        prospectId = pr.id;
        }
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
      return { taken: false as const, id: row.id, prospectId };
    });

    if (created.taken)
      return refuse(
        "slot-taken-race",
        "That slot was just taken. Pick another.",
      );

    await recordBookingAttempt({
      ...attemptBase,
      outcome: "booked",
      reason: link.meetingType,
      bookingId: created.id,
    });

    // AFTER the commit, and never allowed to fail the booking. The time
    // is genuinely held either way; an unsent confirmation is a smaller
    // problem than a slot lost to a mail outage.
    await notifyBooking({
      orgId: link.orgId,
      coachUserProfileId: link.coachUserProfileId,
      builderName: link.coachName ?? "your Business Builder",
      builderEmail: link.coachEmail ?? null,
      meetingName: link.name,
      description: link.description,
      whenLocal: formatSlotLocal(requestedStart),
      durationMinutes: duration,
      bookerName: data.bookerName,
      bookerEmail: data.bookerEmail,
      bookerCompany: data.bookerCompany ?? null,
      notes: data.notes ?? null,
      prospectId: created.prospectId,
    });

    revalidatePath("/business-builder/scheduling");
    return { ok: true, data: { bookingId: created.id } };
  } catch (e) {
    // Reached only by a genuine fault in the write — the refusals above
    // all return before this point. The visitor gets a sentence they can
    // act on; the real text goes to the receipt.
    console.error("[booking] write failed:", e);
    await recordBookingAttempt({
      ...attemptBase,
      outcome: "error",
      reason: "write-failed",
      detail: e instanceof Error ? e.stack || e.message : String(e),
    });
    return { ok: false, error: UNEXPECTED };
  }
}
