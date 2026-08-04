"use client";

/**
 * One button. No picker.
 *
 * This went through two wrong shapes first. Originally the Meetings
 * library showed two rival buttons — "Draft action items from this
 * meeting" and "Draft from meeting" — whose labels differed only in a
 * caption, so they read as duplicates. Collapsing them into one picker
 * fixed the confusion but kept the wrong premise: it still asked the
 * Business Builder to name which of the nine documents the session
 * called for, BEFORE anything had read the transcript.
 *
 * That is backwards. The transcript already knows what the session
 * produced. Asking someone to name it in advance is asking them to
 * remember what they were just in the room for, and to guess how a
 * conversation maps onto a taxonomy.
 *
 * So: one press reads the transcript once and writes both — the
 * commitments people made, and any documents the session genuinely
 * called for (usually none, capped at three). Everything lands as a
 * draft below, to edit, assign and publish.
 *
 * **Why this polls.** The work runs in a Netlify Background Function —
 * it has to, because reading an hour of transcript through Opus takes
 * minutes and a synchronous function on this plan is killed at ~26s.
 * The server action therefore returns the moment the job is ENQUEUED,
 * not when it finishes, and the drafts land in the database somewhere
 * between thirty seconds and several minutes later.
 *
 * The first cut just said "Refresh to pick them up." That reads as a
 * finished instruction, so the natural thing to do is look at the list
 * below — which still says "Nothing waiting", because nothing has been
 * written yet. Same failure mode as every other silent job in this repo:
 * the work is fine, the surface reports nothing, and it looks broken.
 * Bruce hit exactly this on North Central Farming — eight drafts were
 * written while the page in front of him said the list was empty.
 *
 * So the component watches instead of asking. It refreshes on a slow
 * cadence until the count below actually changes, says plainly that it
 * is still working, and gives up after a bounded window with a message
 * that admits it rather than spinning for ever.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { extractActionItemsFromMeeting } from "@/lib/actions/fireflies-extract";

/** How often to re-check while a draft run is in flight. */
const POLL_MS = 12_000;
/** Give up watching after this long. Long-form documents are the slow
 *  case and have their own 15-minute budget in the background function;
 *  six minutes covers the commitments, which is what the list below is
 *  waiting for. */
const WATCH_MS = 6 * 60_000;

export type LastDraftRun = {
  status: "running" | "succeeded" | "failed";
  itemsCreated: number;
  /**
   * Documents queued. Counted separately from `itemsCreated` because
   * they are separately useful and were previously conflated: a run
   * that extracted ZERO commitments but queued one document made the
   * follow-through count go up by one, so the watcher stopped and
   * announced "1 draft landed below, ready for review" — over a row
   * that was only a progress note. Bruce read that as the to-dos
   * working. They hadn't run at all.
   */
  documentsQueued: number;
  errorText: string | null;
  finishedAt: string | null;
};

export function MeetingDraftControls({
  meetingId,
  itemCount,
  lastRun = null,
}: {
  meetingId: string;
  /** How many follow-through items the page rendered with. The poll
   *  stops as soon as this goes up — the only honest signal that the
   *  background job has actually written something. */
  itemCount: number;
  /**
   * The outcome of the most recent run, if there has been one.
   *
   * Before this existed the component could only ever say "still
   * working, or it finished with nothing to add" — the two states it
   * genuinely could not tell apart. A run that DIED (Fireflies returned
   * nothing, the model call failed) looked exactly like a session with
   * no commitments in it, which is how Crown and Ember's 30 July
   * session read: pressed, waited, nothing, no reason.
   */
  lastRun?: LastDraftRun | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const startCount = useRef(itemCount);
  const startedAt = useRef(0);

  // Poll while a run is in flight. `router.refresh()` re-renders the
  // server component tree in place, so new drafts appear below without a
  // navigation and without losing anything typed on the page.
  useEffect(() => {
    if (!watching) return;

    // The run's own numbers beat the row count. A document placeholder
    // increments the rows without a single commitment having been
    // extracted, and reporting that as drafts-ready hid the real
    // outcome.
    if (lastRun && lastRun.status === "succeeded") {
      setWatching(false);
      const { itemsCreated: n, documentsQueued: docs } = lastRun;
      if (n === 0 && docs > 0) {
        setMessage(
          `No to-dos came out of this one — but ${docs} document${docs === 1 ? " is" : "s are"} being written and will appear below in a few minutes. If you expected commitments from this session, press Draft again or add them by hand.`,
        );
      } else if (n === 0) {
        setMessage(
          "It read the whole transcript and found no clear commitments in " +
            "it. Nothing was written. Use “Add something the transcript " +
            "missed” below if you know of one.",
        );
      } else {
        setMessage(
          `${n} to-do${n === 1 ? "" : "s"} landed below, ready for review` +
            (docs > 0
              ? `, and ${docs} document${docs === 1 ? "" : "s"} still being written.`
              : "."),
        );
      }
      return;
    }

    if (itemCount > startCount.current) {
      setWatching(false);
      const added = itemCount - startCount.current;
      setMessage(
        `${added} draft${added === 1 ? "" : "s"} landed below, ready for review.`,
      );
      return;
    }

    // The run reported back. Stop watching and say what it said — this
    // is the whole point of recording the run: a failure now names
    // itself instead of hiding behind "still working, or nothing to add".
    if (lastRun && lastRun.status === "failed") {
      setWatching(false);
      setError(
        lastRun.errorText
          ? `The drafting job failed: ${lastRun.errorText}`
          : "The drafting job failed without saying why. Try again.",
      );
      return;
    }
    const timer = setInterval(() => {
      if (Date.now() - startedAt.current > WATCH_MS) {
        setWatching(false);
        setMessage(
          "Still running after six minutes. Long documents can take that " +
            "long — reload in a few minutes. If nothing has appeared and " +
            "no error is shown here, press Draft again.",
        );
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [watching, itemCount, router, lastRun]);

  const run = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await extractActionItemsFromMeeting({ meetingId });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        startCount.current = itemCount;
        startedAt.current = Date.now();
        setWatching(true);
        setMessage(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  };

  const busy = isPending || watching;

  return (
    <section className="rounded-md border border-tbb-line bg-white px-4 py-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        Draft from this meeting
      </p>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-4 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60 shadow-tbb-cta"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <ClipboardCheck className="w-3.5 h-3.5" aria-hidden />
        )}
        {busy ? "Reading the transcript…" : "Draft from this meeting"}
      </button>
      {watching && (
        <p
          role="status"
          aria-live="polite"
          className="font-sans text-xs text-tbb-navy border border-tbb-line rounded-md px-2.5 py-1.5 bg-tbb-cream-50"
        >
          Reading the whole transcript. This takes a minute or two — leave
          this page open and the drafts will appear below on their own. No
          need to refresh.
        </p>
      )}
      <div className="text-[11px] text-tbb-ink-3 space-y-1">
        <p>
          One press reads the whole transcript and writes up two things: the
          commitments people made, and any of the nine documents this session
          called for. You don&rsquo;t pick — it decides from what was said.
        </p>
        <ol className="list-decimal pl-4 space-y-0.5">
          <li>
            To-dos appear under{" "}
            <span className="font-bold text-tbb-navy">Needs your review</span>{" "}
            on their own, usually within a minute or two. Documents take
            a few minutes longer.
          </li>
          <li>
            Fix the wording, set an owner and a date, then hit{" "}
            <span className="font-bold text-tbb-navy">Publish</span>.
          </li>
          <li>
            Missed something? Use{" "}
            <span className="font-bold text-tbb-navy">
              Add something the transcript missed
            </span>{" "}
            below.
          </li>
        </ol>
        <p className="italic">
          Nothing is visible to the client until you publish it.
        </p>
      </div>
      {/* The last run's verdict, shown whether or not this person was
          watching when it finished. A failure that happened overnight,
          or on somebody else's press, would otherwise be invisible —
          which is exactly the state this whole record exists to end. */}
      {!watching && !message && !error && lastRun?.status === "failed" && (
        <p className="font-sans text-xs text-tbb-danger border border-tbb-danger/40 rounded-md px-2.5 py-1.5 bg-tbb-danger/5">
          <span className="font-bold">The last drafting run failed.</span>{" "}
          {lastRun.errorText ?? "No reason was recorded."} Press Draft to try
          again.
        </p>
      )}
      {!watching &&
        !message &&
        !error &&
        lastRun?.status === "succeeded" &&
        lastRun.itemsCreated === 0 && (
          <p className="font-sans text-xs text-tbb-ink-3 border border-tbb-line rounded-md px-2.5 py-1.5 bg-tbb-cream-50">
            The last run extracted{" "}
            <span className="font-bold text-tbb-navy">no to-dos</span>
            {lastRun.documentsQueued > 0
              ? ` — it wrote ${lastRun.documentsQueued} document${lastRun.documentsQueued === 1 ? "" : "s"} instead. A document doesn't replace the commitments from the session; press Draft again if you expected some.`
              : " from this transcript."}
          </p>
        )}
      {message && (
        <p className="font-sans text-xs text-tbb-navy border border-tbb-line rounded-md px-2.5 py-1.5 bg-tbb-cream-50">
          {message}
        </p>
      )}
      {error && <p className="font-sans text-xs text-tbb-danger">{error}</p>}
    </section>
  );
}
