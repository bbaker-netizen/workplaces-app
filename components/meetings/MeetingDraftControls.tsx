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
 */

import { useState, useTransition } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { extractActionItemsFromMeeting } from "@/lib/actions/fireflies-extract";

export function MeetingDraftControls({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setMessage(
          "Reading the full transcript now. Commitments appear below within " +
            "a minute; any documents it decides the session called for take " +
            "a few minutes longer, and show as “drafting…” until they land. " +
            "Refresh to pick them up.",
        );
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
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill bg-tbb-accent text-white hover:brightness-95 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <ClipboardCheck className="w-3.5 h-3.5" aria-hidden />
        )}
        {isPending ? "Reading the transcript…" : "Draft from this meeting"}
      </button>
      <p className="text-[11px] text-tbb-ink-3">
        Reads the whole transcript and writes up the commitments people made,
        plus any of the nine documents this session actually called for. It
        decides which — you don&rsquo;t have to say in advance. Everything
        arrives below as a draft to edit, assign and publish; nothing reaches
        the client until you do.
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
