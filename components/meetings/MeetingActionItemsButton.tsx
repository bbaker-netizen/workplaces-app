"use client";

/**
 * MeetingActionItemsButton — one click drafts the action items / to-dos out
 * of a synced meeting's FULL Fireflies transcript (not just the highlights).
 * No type picker: the Business Builder just hits the button, then reviews the
 * drafts under Action items — editing, assigning to whoever's appropriate,
 * and publishing to that person.
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
  const [created, setCreated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDraft = () => {
    setError(null);
    setCreated(null);
    startTransition(async () => {
      try {
        const r = await extractActionItemsFromMeeting({ meetingId });
        if (!r.ok) {
          setError(r.error);
        } else {
          setCreated(r.data.created);
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
        disabled={isPending}
        className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <ClipboardCheck className="w-3.5 h-3.5" aria-hidden />
        )}
        {isPending
          ? "Reading the full transcript…"
          : "Draft action items from this meeting"}
      </button>

      {created !== null && (
        <p className="font-sans text-xs text-tbb-navy border border-tbb-line rounded-md px-2.5 py-1.5 bg-tbb-cream-50">
          {created === 0 ? (
            "No clear commitments found in this transcript."
          ) : (
            <>
              {created} draft action{created === 1 ? "" : "s"} created.{" "}
              <Link
                href="/business-builder/action-items"
                className="font-bold text-tbb-blue hover:underline"
              >
                Review &amp; assign →
              </Link>
            </>
          )}
        </p>
      )}
      {error && <p className="font-sans text-xs text-tbb-danger">{error}</p>}
    </section>
  );
}
