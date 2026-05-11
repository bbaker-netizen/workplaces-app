"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { summarizeThread } from "@/lib/actions/thread-summary";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

export function ThreadSummaryButton({
  threadType,
  parentEntityId,
}: {
  threadType: string;
  parentEntityId: string;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const r = await summarizeThread({ threadType, parentEntityId });
      if (!r.ok) setError(r.error);
      else {
        setSummary(r.data.summary);
        setOpen(true);
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="inline-flex items-center gap-1 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-navy bg-white hover:bg-tbb-cream-50 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="w-3 h-3" aria-hidden />
        )}
        Summarize thread
      </button>

      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}

      {open && summary && (
        <div className="border border-tbb-line rounded-md bg-white p-4 space-y-3">
          <header className="flex items-baseline justify-between gap-3">
            <h3 className="font-bold text-foreground text-base tracking-tight">
              AI summary
            </h3>
            <button
              type="button"
              aria-label="Close summary"
              onClick={() => setOpen(false)}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          </header>
          <MarkdownBody body={summary} />
        </div>
      )}
    </div>
  );
}
