/**
 * What counts as a session that actually happened.
 *
 * **The problem this fixes.** Four EA features keyed off
 * `bbs_sessions.status = 'completed'`, and exactly one thing in the whole
 * app ever writes that value: a person clicking "Mark complete" on the
 * session. There is no sweep, no automation, nothing. Sessions arriving
 * from Google Calendar land as `scheduled` and stay `scheduled` for
 * ever.
 *
 * So in practice there was never a "previous session", and the features
 * that depend on one produced nothing while reporting success:
 *
 *   - agenda drafting had no transcript to reason from, so it declined
 *     to propose an agenda at all (correctly — a model with no material
 *     invents one);
 *   - the briefing's "last session" prep line and its still-open-from-
 *     last-time list were always empty;
 *   - hours-per-engagement counted zero session hours, which made every
 *     effective hourly rate in the Friday rollup meaningless.
 *
 * Same shape as every other fault in this module's history: a silent
 * dependency on a manual step nobody performs, whose failure looks
 * exactly like a quiet week.
 *
 * **The rule.** A session in the past that was not cancelled was held.
 * `cancelled` is already the marker for a meeting that did not happen,
 * so it carries the negative case and nothing has to be inferred.
 *
 * This is deliberately a READ-side definition. The alternative — a
 * nightly sweep flipping past sessions to `completed` — was considered
 * and rejected: it writes a claim the system cannot verify, and a
 * meeting nobody attended would be recorded as held. Bruce's call,
 * 2026-07-29. `completeSession()` still means what it always meant, and
 * a coach marking a session complete is still free to do so.
 *
 * One definition, imported everywhere, so the four call sites cannot
 * drift apart again.
 */

import { and, lt, ne, type SQL } from "drizzle-orm";
import { bbsSessions } from "@/lib/db/schema";

/**
 * Predicate: this session had already been held as of `asOf`.
 *
 * Pass the current time for "has happened by now", or another session's
 * `scheduledAt` for "happened before that one" — which is what makes
 * this safe to use for previous-session lookups, where ordering by
 * `scheduledAt DESC` without an upper bound would otherwise return a
 * FUTURE session as the "previous" one.
 */
export function sessionWasHeld(asOf: Date): SQL | undefined {
  return and(
    lt(bbsSessions.scheduledAt, asOf),
    ne(bbsSessions.status, "cancelled"),
  );
}
