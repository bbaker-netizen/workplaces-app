/**
 * Cross-Business-Builder availability for client ad-hoc session booking.
 *
 * Reads each connected Business Builder's Google Calendar busy intervals
 * and offers the client open slots within working hours (Mon–Fri,
 * 08:30–18:00 Mountain Time). A slot is offered when AT LEAST ONE Builder
 * is free for the whole slot; the client books with one of the free ones.
 *
 * Runs entirely server-side under system context (it reads the Builders'
 * calendars via their tokens — the client has no Google connection).
 */

import { DateTime } from "luxon";
import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import {
  bbsSessions,
  coaches,
  engagements,
  orgs,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  GoogleGrantRefusedError,
  GoogleReconnectRequiredError,
  getConnectionStatus,
  listExternalEvents,
} from "@/lib/integrations/google-calendar";

const TZ = "America/Edmonton";
const DAY_START_HOUR = 8;
const DAY_START_MIN = 30;
const DAY_END_HOUR = 18; // 6 PM — end of the workday
const DAY_END_MIN = 0;
const SLOT_MINUTES = 60;
const STEP_MINUTES = 30;
const LEAD_HOURS = 2; // don't offer slots starting within the next 2h

export type AvailBuilder = { id: string; name: string; email: string | null };

export type AvailSlot = {
  /** Slot start as a UTC ISO string. */
  startIso: string;
  /** Mountain-time clock label, e.g. "9:30 AM". */
  label: string;
  /** Builders free for this slot. */
  builders: { id: string; name: string }[];
};

export type AvailDay = {
  /** YYYY-MM-DD (MT). */
  isoDate: string;
  /** e.g. "Mon, Jun 23". */
  label: string;
  slots: AvailSlot[];
};

export type Availability = {
  days: AvailDay[];
  /** True if at least one Business Builder has Google connected. */
  anyConnected: boolean;
};

async function getConnectedBuilders(): Promise<AvailBuilder[]> {
  const builders = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];
    const rows = await tx
      .select({
        id: userProfiles.id,
        name: userProfiles.fullName,
        email: userProfiles.email,
      })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, master.id),
          or(
            eq(userProfiles.role, "master_admin"),
            eq(userProfiles.role, "coach"),
          ),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? "Business Builder",
      email: r.email,
    }));
  });

  // Keep only Builders with Google connected — we can both read their
  // availability and create the invite on their calendar.
  const connected: AvailBuilder[] = [];
  for (const b of builders) {
    try {
      const status = await getConnectionStatus(b.id);
      if (status.connected) connected.push(b);
    } catch {
      // ignore — treat as not connected
    }
  }
  return connected;
}

/* --------------------------- Busy intervals --------------------------- */

/** Half-open [start, end) in epoch milliseconds. */
export type BusyInterval = { start: number; end: number };

export function overlaps(
  slotStart: number,
  slotEnd: number,
  busy: BusyInterval[],
): boolean {
  for (const b of busy) {
    if (slotStart < b.end && slotEnd > b.start) return true;
  }
  return false;
}

/**
 * Why a window came back the way it did. A bare boolean collapsed three
 * very different faults — nobody has connected Google, the grant is
 * dead, the database read failed — into one indistinguishable "no", and
 * the person who has to fix it cannot act on "no".
 */
export type BusyReason =
  | "ok"
  | "not-connected"
  /**
   * The grant is dead: Google refuses tokens it issued seconds earlier,
   * so the retry cannot help and only a reconnect will. Split out of
   * `calendar-error` because the two need opposite responses — one is a
   * transient blip to ignore, the other is a page that stays dark until
   * a human acts, and reporting both as "Google refused the calendar
   * read" left nobody able to tell which they had.
   */
  | "grant-refused"
  /** The refresh token itself is dead — no access token can be had. */
  | "reconnect-required"
  | "calendar-error"
  | "session-read-error";

export type BuilderBusy = {
  /** Everything blocking this Builder in the window. */
  intervals: BusyInterval[];
  /**
   * False when the Builder's calendar could not be read. `intervals` is
   * then a single block covering the whole window — fully busy.
   */
  calendarReadable: boolean;
  reason: BusyReason;
  /** Provider error text when there is one. Operator-facing only. */
  error?: string;
};

/**
 * Sessions this Builder is committed to that live in OUR database.
 *
 * Needed alongside Google because a session booked in the app does not
 * necessarily reach the calendar — of the sessions on the books for the
 * coming week, nearly all carry no Google id at all. A session that DID
 * sync shows up in both sources, which costs nothing: two overlapping
 * intervals answer the same question twice.
 *
 * Internal engagements count for EVERY Business Builder. The practice's
 * own touch-base carries a single `coach_id` like any other engagement,
 * so resolving it by ownership alone would silently leave the other
 * Builder bookable during a meeting they are sitting in — the same trap
 * `resolveAgendaAudience` documents.
 */
export async function listSessionIntervals(
  userProfileId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ ok: true; intervals: BusyInterval[] } | { ok: false }> {
  try {
    const rows = await withSystemContext((tx) =>
      tx
        .select({
          scheduledAt: bbsSessions.scheduledAt,
          durationMin: bbsSessions.durationMin,
        })
        .from(bbsSessions)
        .innerJoin(engagements, eq(engagements.id, bbsSessions.engagementId))
        .innerJoin(coaches, eq(coaches.id, engagements.coachId))
        .where(
          and(
            ne(bbsSessions.status, "cancelled"),
            lt(bbsSessions.scheduledAt, rangeEnd),
            // Overlap, not "starts after the window opens" — a session
            // already under way when the window starts still blocks it.
            sql`${bbsSessions.scheduledAt} + (${bbsSessions.durationMin} * interval '1 minute') > ${rangeStart.toISOString()}::timestamptz`,
            or(
              eq(coaches.userProfileId, userProfileId),
              eq(engagements.isInternal, true),
            ),
          ),
        ),
    );
    return {
      ok: true,
      intervals: rows.map((r) => {
        const start = new Date(r.scheduledAt).getTime();
        return {
          start,
          end: start + Number(r.durationMin ?? 0) * 60_000,
        };
      }),
    };
  } catch (e) {
    console.error("[availability] in-app session read failed:", e);
    return { ok: false };
  }
}

/**
 * Everything that makes ONE Business Builder unavailable in a window.
 *
 * FAILURE POSTURE: if we cannot see a Builder's commitments, they are
 * treated as FULLY BUSY, never fully free. A booking page that shows no
 * times is recoverable — the visitor emails instead. One that offers a
 * slot on top of a client session is not, and nobody finds out until two
 * people join the same call.
 *
 * The connection is checked before the read for a specific reason:
 * `listExternalEvents` returns `[]` when there is no token at all rather
 * than throwing, so a bare try/catch would read "never connected" as
 * "completely free" — the exact inversion this function exists to
 * prevent. Only a revoked token or a network fault throws.
 */
export async function getBuilderBusy(
  userProfileId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BuilderBusy> {
  const wholeWindow: BusyInterval[] = [
    { start: rangeStart.getTime(), end: rangeEnd.getTime() },
  ];

  const sessions = await listSessionIntervals(
    userProfileId,
    rangeStart,
    rangeEnd,
  );
  if (!sessions.ok)
    return {
      intervals: wholeWindow,
      calendarReadable: false,
      reason: "session-read-error",
      error: "The app's own session list could not be read.",
    };

  let connected = false;
  try {
    connected = (await getConnectionStatus(userProfileId)).connected;
  } catch {
    connected = false;
  }
  if (!connected) {
    console.error(
      `[availability] ${userProfileId}: Google Calendar not connected — treating as fully busy`,
    );
    return {
      intervals: wholeWindow,
      calendarReadable: false,
      reason: "not-connected",
      error: "No Google account is connected.",
    };
  }

  try {
    const events = await listExternalEvents(userProfileId, rangeStart, rangeEnd);
    return {
      calendarReadable: true,
      reason: "ok",
      intervals: [
        ...events.map((e) => ({
          start: e.start.getTime(),
          end: e.end.getTime(),
        })),
        ...sessions.intervals,
      ],
    };
  } catch (e) {
    // Named failures first. A dead grant and a dead refresh token both
    // mean this page stays dark until somebody reconnects Google, and
    // saying so is the difference between a Builder acting today and
    // finding out from a prospect who gave up.
    const reason: BusyReason =
      e instanceof GoogleGrantRefusedError
        ? "grant-refused"
        : e instanceof GoogleReconnectRequiredError
          ? "reconnect-required"
          : "calendar-error";
    console.error(
      `[availability] ${userProfileId}: calendar read failed (${reason}) — treating as fully busy:`,
      e,
    );
    return {
      intervals: wholeWindow,
      calendarReadable: false,
      reason,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function getAvailability(
  opts: { days?: number } = {},
): Promise<Availability> {
  const days = opts.days ?? 14;
  const builders = await getConnectedBuilders();
  if (builders.length === 0) return { days: [], anyConnected: false };

  const now = DateTime.now().setZone(TZ);
  const rangeStart = now.toJSDate();
  const rangeEnd = now.plus({ days }).toJSDate();
  const earliest = now.plus({ hours: LEAD_HOURS }).toMillis();

  // Busy intervals per connected Builder. Shared with the public booking
  // page so the two surfaces cannot drift on what "busy" means — and so
  // this one picks up in-app sessions that never reached Google.
  const busyByBuilder = new Map<string, BusyInterval[]>();
  for (const b of builders) {
    const busy = await getBuilderBusy(b.id, rangeStart, rangeEnd);
    busyByBuilder.set(b.id, busy.intervals);
  }

  const out: AvailDay[] = [];
  for (let d = 0; d < days; d++) {
    const day = now.plus({ days: d }).startOf("day");
    const weekday = day.weekday; // 1=Mon … 7=Sun
    if (weekday > 5) continue; // skip weekends

    const dayStart = day.set({
      hour: DAY_START_HOUR,
      minute: DAY_START_MIN,
      second: 0,
      millisecond: 0,
    });
    const dayEnd = day.set({
      hour: DAY_END_HOUR,
      minute: DAY_END_MIN,
      second: 0,
      millisecond: 0,
    });

    const slots: AvailSlot[] = [];
    let cursor = dayStart;
    while (cursor.plus({ minutes: SLOT_MINUTES }) <= dayEnd) {
      const slotStartMs = cursor.toMillis();
      const slotEndMs = cursor.plus({ minutes: SLOT_MINUTES }).toMillis();
      if (slotStartMs >= earliest) {
        const free = builders.filter(
          (b) =>
            !overlaps(slotStartMs, slotEndMs, busyByBuilder.get(b.id) ?? []),
        );
        if (free.length > 0) {
          slots.push({
            startIso: cursor.toUTC().toISO() ?? new Date(slotStartMs).toISOString(),
            label: cursor.toFormat("h:mm a"),
            builders: free.map((b) => ({ id: b.id, name: b.name })),
          });
        }
      }
      cursor = cursor.plus({ minutes: STEP_MINUTES });
    }

    if (slots.length > 0) {
      out.push({
        isoDate: day.toFormat("yyyy-MM-dd"),
        label: day.toFormat("ccc, LLL d"),
        slots,
      });
    }
  }

  return { days: out, anyConnected: true };
}
