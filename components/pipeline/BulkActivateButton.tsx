"use client";

/**
 * Bulk-activate every Contract-signed prospect into an engagement so all
 * your clients are live in the app and ready to prepare. No invites or
 * emails are sent — you invite each client to their portal separately
 * when you're ready.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { activateAllSignedProspects } from "@/lib/actions/activate-engagement";

export function BulkActivateButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function go() {
    if (
      !window.confirm(
        "Activate every Contract-signed client as an engagement?\n\n" +
          "This creates each client's engagement + portal so you can prepare " +
          "it. No invites or emails are sent — you invite each client " +
          "separately when you're ready.",
      )
    ) {
      return;
    }
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const r = await activateAllSignedProspects();
      if (!r.ok) {
        setIsError(true);
        setMessage(r.error);
        return;
      }
      setIsError(false);
      setMessage(
        r.data.activated === 0
          ? "No signed clients needed activating."
          : `Activated ${r.data.activated} client${r.data.activated === 1 ? "" : "s"}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="w-4 h-4" aria-hidden />
        )}
        {isPending ? "Activating…" : "Activate all signed clients"}
      </button>
      {message && (
        <p
          role={isError ? "alert" : "status"}
          className={"text-xs " + (isError ? "text-tbb-danger" : "text-tbb-ink-3")}
        >
          {message}
        </p>
      )}
    </div>
  );
}
