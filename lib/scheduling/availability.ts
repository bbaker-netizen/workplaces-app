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
import { and, eq, or } from "drizzle-orm";
import { orgs, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
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

type Interval = { start: number; end: number };

function overlaps(slotStart: number, slotEnd: number, busy: Interval[]): boolean {
  for (const b of busy) {
    if (slotStart < b.end && slotEnd > b.start) return true;
  }
  return false;
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

  // Busy intervals per connected Builder.
  const busyByBuilder = new Map<string, Interval[]>();
  for (const b of builders) {
    try {
      const events = await listExternalEvents(b.id, rangeStart, rangeEnd);
      busyByBuilder.set(
        b.id,
        events.map((e) => ({
          start: e.start.getTime(),
          end: e.end.getTime(),
        })),
      );
    } catch {
      // If we can't read this Builder's calendar, don't offer them (we'd
      // risk double-booking). Empty = treated as fully busy below.
      busyByBuilder.set(b.id, [{ start: rangeStart.getTime(), end: rangeEnd.getTime() }]);
    }
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
