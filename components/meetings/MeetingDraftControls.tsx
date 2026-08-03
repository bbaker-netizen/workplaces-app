"use client";

/**
 * One drafting control, not two.
 *
 * The Meetings library used to show a big orange "Draft action items
 * from this meeting" button and, directly beneath it, a picker plus a
 * button reading "Draft from meeting". Bruce read them as two ways to
 * do the same thing, which is a fair reading: the labels differed only
 * in a caption above them.
 *
 * They were never the same. The first reads the transcript and produces
 * SEVERAL short commitments; the second produces ONE long-form
 * document. So the choice stays, but it is expressed as one question —
 * what should Claude write? — rather than two competing buttons.
 *
 * Both land in the same place: as drafts on this meeting, below.
 */

import { useState, useTransition } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { extractActionItemsFromMeeting } from "@/lib/actions/fireflies-extract";
import { draftDeliverableFromMeeting } from "@/lib/actions/deliverables-fireflies";
import {
  DELIVERABLE_TYPES,
  DELIVERABLE_TYPE_LABEL,
  type DeliverableType,
} from "@/lib/deliverables/types";

const TODOS = "__todos__";

export function MeetingDraftControls({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>(TODOS);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        if (choice === TODOS) {
          const r = await extractActionItemsFromMeeting({ meetingId });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setMessage(
            "Reading the full transcript now — usually under a minute. The " +
              "drafts appear under “Needs your review” below; refresh to pick " +
              "them up.",
          );
        } else {
          const r = await draftDeliverableFromMeeting({
            meetingId,
            type: choice as DeliverableType,
          });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setMessage(
            "Writing the document now — this one takes a minute or two " +
              "because it reads the whole transcript. It appears under " +
              "“Needs your review” below; refresh to pick it up.",
          );
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  };

  return (
    <section className="rounded-md border border-tbb-line bg-white px-4 py-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        Draft from this meeting
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="sr-only" htmlFor={`draft-choice-${meetingId}`}>
          What to draft
        </label>
        <select
          id={`draft-choice-${meetingId}`}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={isPending}
          className="font-sans text-xs px-2 py-2 rounded-sm border border-tbb-line bg-white text-tbb-navy focus:outline-none focus:border-tbb-blue disabled:opacity-50 max-w-[16rem]"
        >
          <option value={TODOS}>To-dos & commitments</option>
          {DELIVERABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DELIVERABLE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <ClipboardCheck className="w-3.5 h-3.5" aria-hidden />
          )}
          {isPending ? "Starting…" : "Draft it"}
        </button>
      </div>
      <p className="text-[11px] text-tbb-ink-3">
        {choice === TODOS
          ? "Pulls the commitments people made out of the transcript, as several short items."
          : "Writes one long-form document from the whole transcript."}{" "}
        Either way it arrives as a draft — nothing reaches the client until you publish it.
      </p>
      {message && (
        <p className="font-sans text-xs text-tbb-navy border border-tbb-line rounded-md px-2.5 py-1.5 bg-tbb-cream-50">
          {message}
        </p>
      )}
      {error && <p className="font-sans text-xs text-tbb-danger">{error}</p>}
    </section>
  );
}
