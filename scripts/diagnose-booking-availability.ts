/**
 * What a public booking page actually offers, and why.
 *
 * Read-only. Writes nothing, books nothing, sends nothing.
 *
 * Until the calendar fix, `listAvailableSlots` filtered out only times
 * already booked through the SAME scheduling link — it never looked at
 * the Business Builder's calendar, so every weekday rendered wide open
 * and a visitor could book straight over a client session. This prints
 * both answers side by side for each active link so the difference is
 * checkable against a real week rather than asserted.
 *
 *   npx tsx scripts/diagnose-booking-availability.ts [days]
 *
 * BEFORE = the old rule (same-link bookings only).
 * AFTER  = the shipped rule (Google Calendar + in-app sessions +
 *          bookings across all of that Builder's links).
 */

import { readFileSync } from "node:fs";
import { DateTime } from "luxon";

// Load .env.local BEFORE importing anything that reads env at module
// scope (the db client does).
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (!/^[A-Z_][A-Z0-9_]*=/.test(line)) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i);
  if (!process.env[k]) {
    process.env[k] = line
      .slice(i + 1)
      .replace(/^["']|["']$/g, "")
      .trim();
  }
}

const TZ = "America/Edmonton";
const DAYS = Number.parseInt(process.argv[2] ?? "7", 10);

async function main() {
  const { and, eq, isNull } = await import("drizzle-orm");
  const { bookings, schedulingLinks, userProfiles } = await import(
    "../lib/db/schema"
  );
  const { withSystemContext } = await import("../lib/db/tenant");
  const { getBuilderBusy, listSessionIntervals, overlaps } = await import(
    "../lib/scheduling/availability"
  );
  const { getConnectionStatus } = await import(
    "../lib/integrations/google-calendar"
  );

  const links = await withSystemContext((tx) =>
    tx
      .select({
        id: schedulingLinks.id,
        slug: schedulingLinks.slug,
        name: schedulingLinks.name,
        isActive: schedulingLinks.isActive,
        durationMinutes: schedulingLinks.durationMinutes,
        availability: schedulingLinks.availability,
        coachUserProfileId: schedulingLinks.coachUserProfileId,
        coachName: userProfiles.fullName,
      })
      .from(schedulingLinks)
      .innerJoin(
        userProfiles,
        eq(userProfiles.id, schedulingLinks.coachUserProfileId),
      ),
  );

  const now = DateTime.now().setZone(TZ);
  const horizon = now.plus({ days: DAYS });
  const rangeStart = now.toJSDate();
  // End of the last day, matching listAvailableSlots — the slot loop
  // walks whole days and emits slots past the horizon's clock time.
  const rangeEnd = horizon.endOf("day").toJSDate();

  console.log(
    `Window: ${now.toFormat("ccc LLL d HH:mm")} → ${horizon.toFormat(
      "ccc LLL d HH:mm",
    )} (${DAYS} days, ${TZ})\n`,
  );

  for (const link of links.sort((a, b) =>
    (a.coachName ?? "").localeCompare(b.coachName ?? ""),
  )) {
    console.log("=".repeat(72));
    console.log(
      `${link.coachName} — /book/${link.slug} — ${link.name} (${link.durationMinutes} min)` +
        (link.isActive ? "" : "  [INACTIVE]"),
    );

    const conn = await getConnectionStatus(link.coachUserProfileId);
    console.log(
      `  Google: ${conn.connected ? `connected (${conn.email})` : "NOT CONNECTED"}`,
    );

    const busy = await getBuilderBusy(
      link.coachUserProfileId,
      rangeStart,
      rangeEnd,
    );
    console.log(
      `  calendarReadable=${busy.calendarReadable}  busyIntervals=${busy.intervals.length}`,
    );

    // Reported on its own line because it is provable without Google —
    // when the calendar cannot be read the whole window collapses to one
    // fully-busy block and this half becomes invisible inside it.
    const sessions = await listSessionIntervals(
      link.coachUserProfileId,
      rangeStart,
      rangeEnd,
    );
    const sessionIntervals = sessions.ok ? sessions.intervals : [];
    console.log(
      `  in-app sessions blocking this Builder: ${sessionIntervals.length}`,
    );
    for (const s of sessionIntervals) {
      console.log(
        `      ${DateTime.fromMillis(s.start).setZone(TZ).toFormat("ccc LLL d HH:mm")} → ${DateTime.fromMillis(s.end).setZone(TZ).toFormat("HH:mm")}`,
      );
    }

    // Bookings: same-link (the old rule) and all-links (the new one).
    const sameLink = await withSystemContext((tx) =>
      tx
        .select({
          bookedAt: bookings.bookedAt,
          durationMinutes: bookings.durationMinutes,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.schedulingLinkId, link.id),
            isNull(bookings.cancelledAt),
          ),
        ),
    );
    const allLinks = await withSystemContext((tx) =>
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
            eq(
              schedulingLinks.coachUserProfileId,
              link.coachUserProfileId,
            ),
            isNull(bookings.cancelledAt),
          ),
        ),
    );
    console.log(
      `  bookings: ${sameLink.length} on this link, ${allLinks.length} across all their links`,
    );

    const takenExact = new Set(
      sameLink.map((b) => new Date(b.bookedAt).getTime()),
    );
    const blocked = [
      ...busy.intervals,
      ...allLinks.map((b) => {
        const s = new Date(b.bookedAt).getTime();
        return { start: s, end: s + Number(b.durationMinutes ?? 0) * 60_000 };
      }),
    ];

    const avail = (link.availability ?? {}) as {
      weekdays?: number[];
      startMinute?: number;
      endMinute?: number;
    };
    const weekdays = new Set(avail.weekdays ?? [1, 2, 3, 4, 5]);
    const startMin = avail.startMinute ?? 510;
    const endMin = avail.endMinute ?? 1080;
    const dur = Number(link.durationMinutes);

    let beforeTotal = 0;
    let afterTotal = 0;
    let sessionsOnlyRemoved = 0;
    const lines: string[] = [];

    let cursor = now.startOf("day");
    while (cursor < horizon) {
      if (weekdays.has(cursor.weekday)) {
        let before = 0;
        const kept: string[] = [];
        let m = startMin;
        while (m + dur <= endMin) {
          const slot = cursor.set({
            hour: Math.floor(m / 60),
            minute: m % 60,
            second: 0,
            millisecond: 0,
          });
          if (slot > now) {
            const s = slot.toMillis();
            const e = slot.plus({ minutes: dur }).toMillis();
            if (!takenExact.has(slot.toJSDate().getTime())) before++;
            if (!overlaps(s, e, blocked)) kept.push(slot.toFormat("H:mm"));
            if (overlaps(s, e, sessionIntervals)) sessionsOnlyRemoved++;
          }
          m += dur;
        }
        beforeTotal += before;
        afterTotal += kept.length;
        if (before > 0 || kept.length > 0) {
          lines.push(
            `    ${cursor.toFormat("ccc LLL d")}: before ${String(before).padStart(2)} → after ${String(kept.length).padStart(2)}` +
              (kept.length && kept.length !== before
                ? `   free: ${kept.join(" ")}`
                : kept.length === 0
                  ? "   (nothing free)"
                  : ""),
          );
        }
      }
      cursor = cursor.plus({ days: 1 });
    }

    console.log(
      `  SLOTS: before ${beforeTotal} → after ${afterTotal}  (removed ${beforeTotal - afterTotal})`,
    );
    console.log(
      `         of which in-app sessions alone would remove ${sessionsOnlyRemoved}`,
    );
    for (const l of lines) console.log(l);
    console.log();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
