"use client";

/**
 * "Sync from Google" — pulls the coach's upcoming Google Calendar events
 * into BBS sessions for the matching engagement, on demand. The half-
 * hourly background job does the same thing automatically; this button is
 * for when you want it now and want to see the result.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { syncMyCalendarNow } from "@/lib/actions/calendar-sync";

export function SyncFromGoogleButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSync() {
    setMsg(null);
    setNeedsConnect(false);
    startTransition(async () => {
      const r = await syncMyCalendarNow();
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      const res = r.result;
      if (res.skipped) {
        if (res.reason === "not-connected") {
          setNeedsConnect(true);
        } else if (res.reason === "no-engagements") {
          setMsg("No active clients to match calendar events to yet.");
        } else {
          setMsg("Nothing to sync.");
        }
        return;
      }
      const parts: string[] = [];
      if (res.created) parts.push(`${res.created} added`);
      if (res.updated) parts.push(`${res.updated} updated`);
      if (res.cancelled) parts.push(`${res.cancelled} cancelled`);
      setMsg(parts.length ? `Synced — ${parts.join(", ")}.` : "Already up to date.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={onSync}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-md border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" aria-hidden />
        )}
        Sync from Google
      </button>
      {needsConnect ? (
        <Link
          href="/business-builder/profile/google-calendar"
          className="text-xs font-bold text-tbb-blue hover:underline"
        >
          Connect Google Calendar →
        </Link>
      ) : msg ? (
        <span className="text-xs text-tbb-ink-3">{msg}</span>
      ) : null}
    </div>
  );
}
