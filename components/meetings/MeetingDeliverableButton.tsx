"use client";

/**
 * MeetingDeliverableButton — draft one of the nine deliverables straight
 * from a synced meeting in the engagement's Meetings library. Type picker
 * + button; on success it points the Builder at the Deliverables module,
 * where the draft waits as "In progress" to edit before delivering.
 */

import { useState, useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
import { draftDeliverableFromMeeting } from "@/lib/actions/deliverables-fireflies";
import {
  DELIVERABLE_TYPES,
  DELIVERABLE_TYPE_LABEL,
  type DeliverableType,
} from "@/lib/deliverables/types";

export function MeetingDeliverableButton({ meetingId }: { meetingId: string }) {
  const [type, setType] = useState<DeliverableType>(DELIVERABLE_TYPES[0]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDraft = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const r = await draftDeliverableFromMeeting({ meetingId, type });
      if (!r.ok) {
        setError(r.error);
      } else {
        setMessage(
          `Drafted “${r.data.title}”. Find it under Deliverables (In progress) to review and edit before delivering.`,
        );
      }
    });
  };

  return (
    <section className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        Draft a deliverable from this meeting
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center rounded-pill border border-tbb-blue overflow-hidden">
          <label className="sr-only" htmlFor={`draft-type-${meetingId}`}>
            Deliverable type
          </label>
          <select
            id={`draft-type-${meetingId}`}
            value={type}
            onChange={(e) => setType(e.target.value as DeliverableType)}
            disabled={isPending}
            className="font-sans text-xs px-2 py-1.5 bg-white text-tbb-navy border-r border-tbb-line focus:outline-none disabled:opacity-50 max-w-[10rem]"
          >
            {DELIVERABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {DELIVERABLE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onDraft}
            disabled={isPending}
            className="font-sans text-xs uppercase tracking-tbb-caps font-bold px-3 py-1.5 text-tbb-navy hover:bg-tbb-cream-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <FileText className="w-3.5 h-3.5" aria-hidden />
            )}
            {isPending ? "Drafting…" : "Draft from meeting"}
          </button>
        </span>
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
