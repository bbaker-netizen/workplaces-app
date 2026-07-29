"use client";

/**
 * Availability on the client's record — generate the link, then show what
 * they sent back.
 *
 * The answer lands here automatically. That is the entire reason this
 * replaced the Google Form: nobody reads an email and re-keys the times.
 */

import { useState, useTransition } from "react";
import { CalendarCheck, Copy, Link2, Loader2 } from "lucide-react";
import { createAvailabilityRequest } from "@/lib/actions/availability-requests";
import { describeSlots, type GridSlot } from "@/lib/scheduling/availability-grid";

export function ProspectAvailabilityPanel({
  prospectId,
  submittedAt,
  slots,
  note,
  existingToken,
}: {
  prospectId: string;
  submittedAt: Date | null;
  slots: GridSlot[];
  note: string | null;
  existingToken: string | null;
}) {
  const [url, setUrl] = useState<string | null>(
    existingToken
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/availability/${existingToken}`
      : null,
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function makeLink() {
    setError(null);
    startTransition(async () => {
      const r = await createAvailabilityRequest(prospectId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setUrl(r.data.url);
    });
  }

  if (submittedAt) {
    return (
      <div className="p-5 space-y-2">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-tbb-success" aria-hidden />
          <span className="font-sans text-sm font-bold text-foreground">
            Availability received
          </span>
          <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
            {submittedAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <p className="font-sans text-sm text-tbb-ink-2">
          {describeSlots(slots)}
        </p>
        {note && (
          <p className="font-sans text-sm text-tbb-ink-2 border-l-2 border-tbb-line pl-3">
            {note}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 space-y-3">
      <p className="font-sans text-sm text-tbb-ink-2">
        Send the client a link to pick their recurring meeting windows. Their
        answer lands here automatically and both Business Builders are emailed.
      </p>
      {url ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-[11px] bg-tbb-cream-50 border border-tbb-line rounded px-2 py-1 break-all">
              {url}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-blue hover:underline"
            >
              <Copy className="w-3 h-3" aria-hidden />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-4">
            Paste into the onboarding email — awaiting their reply
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={makeLink}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3.5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Link2 className="w-3.5 h-3.5" aria-hidden />
          )}
          Create availability link
        </button>
      )}
      {error && <p className="font-sans text-xs text-tbb-danger">{error}</p>}
    </div>
  );
}
