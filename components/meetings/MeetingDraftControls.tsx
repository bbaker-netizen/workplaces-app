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

export function MeetingDraftControls({
  meetingId,
  itemCount,
}: {
  meetingId: string;
  /** How many follow-through items the page rendered with. The poll
   *  stops as soon as this goes up — the only honest signal that the
   *  background job has actually written something. */
  itemCount: number;
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

    if (itemCount > startCount.current) {
      setWatching(false);
      const added = itemCount - startCount.current;
      setMessage(
        `${added} draft${added === 1 ? "" : "s"} landed below, ready for review.`,
      );
      return;
    }

    const timer = setInterval(() => {
      if (Date.now() - startedAt.current > WATCH_MS) {
        setWatching(false);
        setMessage(
          "Still working, or it finished with nothing to add. Reload the " +
            "page in a few minutes — if it is still empty, the transcript " +
            "may not have contained any clear commitments.",
        );
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [watching, itemCount, router]);

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
      {message && (
        <p className="font-sans text-xs text-tbb-navy border border-tbb-line rounded-md px-2.5 py-1.5 bg-tbb-cream-50">
          {message}
        </p>
      )}
      {error && <p className="font-sans text-xs text-tbb-danger">{error}</p>}
    </section>
  );
}
