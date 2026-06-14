"use client";

/**
 * Error boundary for the Business Builder console. Turns a crash into a
 * visible message + reload instead of a blank page, and logs the error
 * (with its digest) so the cause is recoverable from the function logs.
 */

import { useEffect } from "react";

export default function BusinessBuilderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Business Builder error boundary:", error);
  }, [error]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="font-bold text-foreground text-2xl tracking-tight">
          This page hit a snag
        </h1>
        <p className="text-sm text-muted-foreground">
          Something errored while loading. Reload to try again.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">
            Error ref: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
        >
          Reload
        </button>
      </div>
    </main>
  );
}
