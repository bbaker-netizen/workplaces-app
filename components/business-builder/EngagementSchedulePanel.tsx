"use client";

/**
 * The client's recurring session schedule, set during onboarding.
 *
 * **Look first, then create** — Bruce's call, and the reason it is two
 * steps rather than a form. Most clients are ALREADY booked into a
 * Business Builder's Google Calendar every week or fortnight; the app
 * simply never knew. Offering only a "create a recurrence" form would
 * have produced a second, rival series for every one of those clients
 * and put a duplicate invitation on the calendar.
 *
 * So: scan the calendar, show what's there, adopt the right one in a
 * click. Only if nothing matches do you fill anything in, and then the
 * app creates the series and pushes ONE recurring event to Google.
 *
 * Adopted series are Google-owned: occurrences are read from the
 * calendar and never written back. The calendar is where the meeting was
 * agreed, and a second writer would fight the first.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Loader2, RefreshCw } from "lucide-react";
import {
  createSessionSeries,
  linkGoogleSeriesToEngagement,
  listLinkableGoogleSeries,
} from "@/lib/actions/session-series";
import { fromDateTimeLocalValue } from "@/components/sessions/utils";

type GoogleOption = {
  recurringEventId: string;
  calendarId: string;
  summary: string;
  scheduleHint: string | null;
  nextStart: string | null;
};

export type ExistingSeries = {
  id: string;
  title: string;
  source: string;
  cadence: string | null;
  anchorAt: string | null;
};

const CADENCES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
] as const;

/**
 * Rank the calendar's recurring events by how likely each is to BE this
 * client's session. A Business Builder's calendar carries dozens of
 * recurrences — the client's own name in the title is the only signal
 * worth trusting, so matches float to the top and everything else stays
 * available but out of the way.
 */
function scoreMatch(summary: string, clientName: string): number {
  const s = summary.toLowerCase();
  const words = clientName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  const hits = words.filter((w) => s.includes(w)).length;
  return hits / words.length;
}

export function EngagementSchedulePanel({
  engagementId,
  clientName,
  existing,
}: {
  engagementId: string;
  clientName: string;
  existing: ExistingSeries[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState<GoogleOption[] | null>(null);
  const [scanState, setScanState] = useState<
    "idle" | "scanning" | "done" | "error"
  >("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create-form state.
  const [title, setTitle] = useState(`${clientName} — Business Building Session`);
  const [cadence, setCadence] = useState<string>("biweekly");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("60");

  const alreadyLinked = existing.length > 0;

  // Scan on mount, but only when there is nothing linked yet. An
  // engagement that already has its schedule shouldn't spend a Google
  // round trip every time the page renders.
  useEffect(() => {
    if (alreadyLinked || scanState !== "idle") return;
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyLinked, scanState]);

  async function scan() {
    setScanState("scanning");
    setScanError(null);
    const result = await listLinkableGoogleSeries();
    if (!result.ok) {
      setScanState("error");
      setScanError(result.error);
      setNeedsReconnect(result.needsReconnect);
      return;
    }
    setOptions(
      result.series.map((s) => ({
        recurringEventId: s.recurringEventId,
        calendarId: s.calendarId,
        summary: s.summary,
        scheduleHint: s.scheduleHint,
        nextStart: s.nextStart ? new Date(s.nextStart).toISOString() : null,
      })),
    );
    setScanState("done");
  }

  function adopt(o: GoogleOption) {
    setError(null);
    setMessage(null);
    setBusyId(o.recurringEventId);
    startTransition(async () => {
      const r = await linkGoogleSeriesToEngagement({
        engagementId,
        googleCalendarId: o.calendarId,
        googleRecurringEventId: o.recurringEventId,
        title: o.summary,
      });
      setBusyId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMessage(
        `Linked. ${r.data.synced} upcoming session${r.data.synced === 1 ? "" : "s"} pulled in from your calendar.`,
      );
      router.refresh();
    });
  }

  function create() {
    setError(null);
    setMessage(null);
    if (!startsAt) {
      setError("Pick the date and time of the first session.");
      return;
    }
    startTransition(async () => {
      const r = await createSessionSeries({
        engagementId,
        title: title.trim(),
        type: "virtual",
        cadence: cadence as "weekly" | "biweekly" | "monthly",
        // The action takes a UTC ISO string; the helper returns a Date
        // from a Mountain-Time datetime-local value.
        anchorAt: fromDateTimeLocalValue(startsAt).toISOString(),
        durationMin: Number(duration) || 60,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMessage(
        `Schedule created — ${r.data.created} session${r.data.created === 1 ? "" : "s"} on the books, and the recurring event is on your calendar.`,
      );
      setShowCreate(false);
      router.refresh();
    });
  }

  const ranked = (options ?? [])
    .map((o) => ({ o, score: scoreMatch(o.summary, clientName) }))
    .sort((a, b) => b.score - a.score);
  const likely = ranked.filter((r) => r.score >= 0.5).map((r) => r.o);
  const others = ranked.filter((r) => r.score < 0.5).map((r) => r.o);

  return (
    <section className="rounded-md border border-tbb-line bg-white px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 inline-flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" aria-hidden /> Recurring sessions
        </p>
        {!alreadyLinked && scanState === "done" && (
          <button
            type="button"
            onClick={() => void scan()}
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue"
          >
            <RefreshCw className="w-3 h-3" aria-hidden /> Re-scan
          </button>
        )}
      </div>

      {alreadyLinked ? (
        <ul className="space-y-1.5">
          {existing.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 text-sm text-tbb-ink-2"
            >
              <Check className="w-4 h-4 text-tbb-blue shrink-0 mt-0.5" aria-hidden />
              <span>
                <span className="font-bold text-tbb-navy">{s.title}</span>
                <span className="block text-xs text-tbb-ink-3">
                  {s.source === "google"
                    ? "Read from your Google Calendar — change it there and the app follows."
                    : `${CADENCES.find((c) => c.value === s.cadence)?.label ?? s.cadence ?? "Recurring"}, generated by the app and on your calendar.`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {scanState === "scanning" && (
            <p className="text-xs text-tbb-ink-3 inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              Checking your Google Calendar for a meeting with {clientName}…
            </p>
          )}

          {scanState === "error" && (
            <div className="text-xs text-tbb-danger space-y-1">
              <p>{scanError}</p>
              {needsReconnect && (
                <a
                  href="/business-builder/settings/integrations"
                  className="font-bold underline underline-offset-4"
                >
                  Reconnect Google
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="block font-bold text-tbb-blue underline underline-offset-4"
              >
                Set the schedule by hand instead
              </button>
            </div>
          )}

          {scanState === "done" && (
            <div className="space-y-2">
              {likely.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-tbb-ink-3">
                    Found on your calendar — link the right one and the app
                    follows it from here:
                  </p>
                  {likely.map((o) => (
                    <GoogleRow
                      key={o.recurringEventId}
                      option={o}
                      busy={pending && busyId === o.recurringEventId}
                      onAdopt={() => adopt(o)}
                    />
                  ))}
                </div>
              )}

              {likely.length === 0 && (
                <p className="text-xs text-tbb-ink-3">
                  Nothing on your calendar looks like a recurring meeting with{" "}
                  <span className="font-bold text-tbb-navy">{clientName}</span>.
                </p>
              )}

              {others.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-tbb-ink-3 hover:text-tbb-navy">
                    Show my other {others.length} recurring meeting
                    {others.length === 1 ? "" : "s"}
                  </summary>
                  <div className="pt-1.5 space-y-1.5">
                    {others.map((o) => (
                      <GoogleRow
                        key={o.recurringEventId}
                        option={o}
                        busy={pending && busyId === o.recurringEventId}
                        onAdopt={() => adopt(o)}
                      />
                    ))}
                  </div>
                </details>
              )}

              {!showCreate && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline underline-offset-4"
                >
                  + Set up a new recurring session instead
                </button>
              )}
            </div>
          )}

          {showCreate && (
            <div className="rounded-md border border-tbb-line-soft bg-tbb-cream-50/60 p-3 space-y-2.5">
              <p className="text-xs text-tbb-ink-3">
                The app will generate the dates and put one recurring event on
                your calendar.
              </p>
              <label className="block">
                <span className="block text-[11px] font-bold text-tbb-navy mb-1">
                  Meeting name
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-tbb-line px-2.5 py-1.5 text-sm"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="block text-[11px] font-bold text-tbb-navy mb-1">
                    Cadence
                  </span>
                  <select
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value)}
                    className="w-full rounded-md border border-tbb-line px-2.5 py-1.5 text-sm"
                  >
                    {CADENCES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-[11px] font-bold text-tbb-navy mb-1">
                    First session (Mountain Time)
                  </span>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full rounded-md border border-tbb-line px-2.5 py-1.5 text-sm"
                  />
                </label>
              </div>
              <label className="block max-w-[10rem]">
                <span className="block text-[11px] font-bold text-tbb-navy mb-1">
                  Minutes
                </span>
                <input
                  type="number"
                  min={15}
                  max={480}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full rounded-md border border-tbb-line px-2.5 py-1.5 text-sm"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={create}
                  className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60"
                >
                  {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                  Create the schedule
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-xs uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {message && (
        <p className="text-xs text-tbb-blue border-l-2 border-tbb-blue pl-2.5 py-0.5">
          {message}
        </p>
      )}
      {error && (
        <p className="text-xs text-tbb-danger border-l-2 border-tbb-danger pl-2.5 py-0.5">
          {error}
        </p>
      )}
    </section>
  );
}

function GoogleRow({
  option,
  busy,
  onAdopt,
}: {
  option: GoogleOption;
  busy: boolean;
  onAdopt: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-tbb-line px-2.5 py-2">
      <div className="min-w-0">
        <p className="text-sm font-bold text-tbb-navy truncate">
          {option.summary}
        </p>
        <p className="text-[11px] text-tbb-ink-3">
          {option.scheduleHint ?? "Recurring"}
          {option.nextStart
            ? ` · next ${new Date(option.nextStart).toLocaleDateString("en-CA", {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: "America/Edmonton",
              })}`
            : ""}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onAdopt}
        className="shrink-0 inline-flex items-center gap-1.5 font-sans text-[11px] uppercase tracking-tbb-caps font-bold px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
        Link
      </button>
    </div>
  );
}
