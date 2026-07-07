"use client";

/**
 * CheckFollowupsButton — pulls any due follow-ups into notifications on
 * demand, instead of waiting for the daily morning check. Useful for
 * verifying the reminder flow and for a coach who wants to sweep now.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { checkFollowupsNow } from "@/lib/actions/notifications";

export function CheckFollowupsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      const r = await checkFollowupsNow();
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setMsg(
        r.created > 0
          ? `Added ${r.created} follow-up reminder${r.created === 1 ? "" : "s"}.`
          : "No follow-ups are due right now.",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-white border border-tbb-line text-tbb-navy hover:border-tbb-blue disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <CalendarClock className="w-3.5 h-3.5" aria-hidden />
        )}
        Check for due follow-ups now
      </button>
      {msg && <span className="text-sm text-tbb-ink-2">{msg}</span>}
    </div>
  );
}
