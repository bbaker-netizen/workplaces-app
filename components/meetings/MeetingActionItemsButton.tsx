"use client";

/**
 * MeetingActionItemsButton — one click kicks off drafting the action items /
 * to-dos out of a synced meeting's FULL Fireflies transcript (not just the
 * highlights). No type picker. Because reading an hour-plus transcript through
 * Claude takes longer than a web request can wait, the work runs in the
 * background; the drafts land under Action items shortly, where the Business
 * Builder edits them, assigns each to whoever's appropriate, and publishes.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { extractActionItemsFromMeeting } from "@/lib/actions/fireflies-extract";

export function MeetingActionItemsButton({
  meetingId,
}: {
  meetingId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDraft = () => {
    setError(null);
    setQueued(false);
    startTransition(async () => {
      try {
        const r = await extractActionItemsFromMeeting({ meetingId });
        if (!r.ok) {
          setError(r.error);
        } else {
          setQueued(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  };

  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={onDraft}
        disabled={isPending || queued}
        className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <ClipboardCheck className="w-3.5 h-3.5" aria-hidden />
        )}
        {isPending
          ? "Starting…"
          : queued
            ? "Drafting in the background…"
            : "Draft action items from this meeting"}
      </button>

      {queued && (
        <p className="font-sans text-xs text-tbb-navy border border-tbb-line rounded-md px-2.5 py-1.5 bg-tbb-cream-50">
          Reading the full transcript now — this runs in the background and
          usually takes under a minute.{" "}
          <Link
            href="/business-builder/action-items"
            className="font-bold text-tbb-blue hover:underline"
          >
            Open Action items
          </Link>{" "}
          and refresh to see the drafts, then assign &amp; publish.
        </p>
      )}
      {error && <p className="font-sans text-xs text-tbb-danger">{error}</p>}
    </section>
  );
}
