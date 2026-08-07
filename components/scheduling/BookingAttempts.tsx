/**
 * Who tried to book, and what happened to them.
 *
 * The gap this closes: `bookings` records what SUCCEEDED, and nothing
 * recorded what didn't. So a visitor who tried three times and was
 * refused looked, from the console, exactly like a visitor who never
 * came — an empty table either way. On a public revenue path that is the
 * worst possible place for an absence to be ambiguous.
 *
 * Deliberately shows successes too. A list of only failures cannot be
 * read: "two refusals this week" means one thing next to forty bookings
 * and something else entirely next to none.
 */

import { DateTime } from "luxon";
import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { BookingAttemptRow } from "@/lib/booking/attempts";

const TZ = "America/Edmonton";

function when(d: Date): string {
  return DateTime.fromJSDate(d).setZone(TZ).toFormat("ccc LLL d, h:mm a");
}

export function BookingAttempts({
  attempts,
}: {
  attempts: BookingAttemptRow[];
}) {
  if (attempts.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="font-sans text-sm font-bold uppercase tracking-tbb-caps text-tbb-ink-2">
          Recent booking attempts
        </h2>
        <p className="font-sans text-xs text-tbb-ink-3">
          Nobody has tried to book in the last two weeks. This says nothing
          about whether the pages work — check the panel above for that.
        </p>
      </section>
    );
  }

  const failures = attempts.filter((a) => a.outcome !== "booked").length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-sans text-sm font-bold uppercase tracking-tbb-caps text-tbb-ink-2">
          Recent booking attempts
        </h2>
        <span className="font-sans text-xs text-tbb-ink-3">
          {attempts.length} in the last 14 days
          {failures > 0 ? ` · ${failures} didn't complete` : ""}
        </span>
      </div>

      <ul className="divide-y divide-tbb-line border border-tbb-line rounded-md bg-white">
        {attempts.map((a) => {
          const failed = a.outcome === "error";
          const refused = a.outcome === "refused";
          return (
            <li key={a.id} className="p-3 space-y-1">
              <div className="flex items-start gap-2">
                {a.outcome === "booked" ? (
                  <CheckCircle2
                    className="w-4 h-4 text-tbb-navy shrink-0 mt-0.5"
                    aria-hidden
                  />
                ) : failed ? (
                  <XCircle
                    className="w-4 h-4 text-tbb-orange-700 shrink-0 mt-0.5"
                    aria-hidden
                  />
                ) : (
                  <MinusCircle
                    className="w-4 h-4 text-tbb-ink-3 shrink-0 mt-0.5"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-sans text-sm text-tbb-navy">
                    {a.bookerName ?? "(no name given)"}{" "}
                    <span className="font-mono text-[11px] text-tbb-ink-3">
                      /book/{a.slug}
                    </span>
                  </div>
                  <div className="font-sans text-xs text-tbb-ink-3">
                    {when(a.createdAt)}
                    {a.requestedStart
                      ? ` · wanted ${when(a.requestedStart)}`
                      : ""}
                    {a.bookerEmail ? ` · ${a.bookerEmail}` : ""}
                  </div>
                </div>
                <span
                  className={
                    "font-mono text-[10px] uppercase tracking-tbb-caps shrink-0 " +
                    (failed
                      ? "text-tbb-orange-700 font-bold"
                      : refused
                        ? "text-tbb-ink-3"
                        : "text-tbb-navy")
                  }
                >
                  {a.outcome}
                </span>
              </div>

              {/* The sentence the visitor was shown, or the fault. This is
                  the whole reason the table exists — without it "refused"
                  is as uninformative as the silence it replaced. */}
              {a.outcome !== "booked" && a.detail && (
                <p
                  className={
                    "font-mono text-[11px] break-words pl-6 " +
                    (failed ? "text-tbb-orange-700" : "text-tbb-ink-3")
                  }
                >
                  {a.reason ? `${a.reason} — ` : ""}
                  {a.detail.slice(0, 400)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="font-sans text-xs text-tbb-ink-3">
        <strong>refused</strong> means we said no on purpose — the slot had
        gone, the time had passed, the calendar could not be checked.{" "}
        <strong>error</strong> means something broke on our side and is always
        worth reading.
      </p>
    </section>
  );
}
