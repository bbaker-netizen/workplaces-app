"use client";

import { useState, useTransition } from "react";
import { Loader2, Link as LinkIcon, Unlink } from "lucide-react";
import {
  disconnectQbo,
  startQboAuthorize,
} from "@/lib/actions/qbo";

export function QuickBooksConnectButton({
  mode,
}: {
  mode: "connect" | "reconnect";
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function connect() {
    setError(null);
    startTransition(async () => {
      const result = await startQboAuthorize();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.data.authorizeUrl;
    });
  }

  function disconnect() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Disconnect QuickBooks? You'll need to reconnect before sending QBO invoices.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await disconnectQbo();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={connect}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <LinkIcon className="w-4 h-4" aria-hidden />
          )}
          {mode === "connect" ? "Connect QuickBooks" : "Reconnect"}
        </button>
        {mode === "reconnect" && (
          <button
            type="button"
            onClick={disconnect}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill border border-tbb-danger text-tbb-danger bg-white hover:bg-tbb-cream-50 disabled:opacity-50"
          >
            <Unlink className="w-3 h-3" aria-hidden />
            Disconnect
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="font-sans text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
        >
          {error}
        </p>
      )}
    </div>
  );
}
