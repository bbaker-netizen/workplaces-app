"use server";

/**
 * Suggest open meeting slots that don't clash with existing
 * coaching sessions. Pure server-side scan — walks the next N days
 * within Bruce's preferred windows, drops any slot that overlaps a
 * bbs_sessions row.
 *
 * Returns up to ~30 slots so the UI doesn't drown. Time math is done
 * in UTC; Bruce's calendar lives in America/Edmonton but we render
 * timestamps with toLocaleString which handles the conversion.
 */

import { and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { DateTime } from "luxon";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { bbsSessions } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

// Suggestions are anchored to the coach's working day in Mountain Time,
// never the server clock (UTC on Netlify).
const SUGGEST_TIMEZONE = "America/Edmonton";

const inputSchema = z.object({
  durationMinutes: z.number().int().min(15).max(240),
  horizonDays: z.number().int().min(1).max(60),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
});

export type SuggestedSlot = {
  startIso: string;
  endIso: string;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const STEP_MINUTES = 30; // candidate slots align to :00 and :30
const MAX_RETURN = 30;

export async function suggestOpenSlots(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult<{ slots: SuggestedSlot[] }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  const { durationMinutes, horizonDays, weekdays, startHour, endHour } =
    parsed.data;

  if (endHour <= startHour) {
    return { ok: false, error: "End hour must be after start hour." };
  }
  const weekdaySet = new Set(weekdays);

  // Range we need to load existing sessions for: now → now + horizon.
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const existing = await withSystemContext(async (tx) =>
    tx
      .select({
        scheduledAt: bbsSessions.scheduledAt,
        // No duration column on bbs_sessions yet — assume 60 min for
        // collision detection. Slightly more conservative than the
        // user-picked duration, which is fine for a suggestion tool.
      })
      .from(bbsSessions)
      .where(
        and(
          gte(bbsSessions.scheduledAt, now),
          lte(bbsSessions.scheduledAt, horizonEnd),
        ),
      ),
  );
  // Build a list of busy intervals — start, end (assuming 60min each).
  const ASSUMED_SESSION_MIN = 60;
  const busy: Array<{ start: number; end: number }> = existing.map((e) => ({
    start: e.scheduledAt.getTime(),
    end: e.scheduledAt.getTime() + ASSUMED_SESSION_MIN * 60 * 1000,
  }));

  function overlapsBusy(startMs: number, endMs: number): boolean {
    for (const b of busy) {
      if (startMs < b.end && endMs > b.start) return true;
    }
    return false;
  }

  const slots: SuggestedSlot[] = [];
  // Walk every day in the horizon. For each day that matches an
  // accepted weekday, generate candidate slots in step-minute
  // increments inside the start/end hour window — all anchored to
  // Mountain Time, not the server clock.
  const nowMt = DateTime.fromJSDate(now).setZone(SUGGEST_TIMEZONE);
  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
    const dayMt = nowMt.plus({ days: dayOffset });
    // luxon weekday is 1=Mon..7=Sun; JS getDay() is 0=Sun..6=Sat.
    if (!weekdaySet.has(dayMt.weekday % 7)) continue;
    // Start/end of the working window at startHour/endHour Mountain Time
    // (luxon resolves the correct UTC instant, including DST).
    const dayStartMs = dayMt
      .set({ hour: startHour, minute: 0, second: 0, millisecond: 0 })
      .toMillis();
    const dayEndMs = dayMt
      .set({ hour: endHour, minute: 0, second: 0, millisecond: 0 })
      .toMillis();
    // Walk the day in STEP_MINUTES increments. Skip slots that already
    // started, that would extend past dayEnd, or that overlap a busy.
    for (
      let t = dayStartMs;
      t + durationMinutes * 60 * 1000 <= dayEndMs;
      t += STEP_MINUTES * 60 * 1000
    ) {
      if (t < now.getTime() + 60 * 60 * 1000) continue; // skip past + the next hour
      const end = t + durationMinutes * 60 * 1000;
      if (overlapsBusy(t, end)) continue;
      slots.push({
        startIso: new Date(t).toISOString(),
        endIso: new Date(end).toISOString(),
      });
      if (slots.length >= MAX_RETURN) {
        return { ok: true, data: { slots } };
      }
    }
  }
  return { ok: true, data: { slots } };
}
