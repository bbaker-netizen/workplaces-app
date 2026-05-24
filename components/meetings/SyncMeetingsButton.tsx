"use client";

/**
 * "Sync from Fireflies" button for the engagement Meetings page.
 * Calls the server action and surfaces a quick result message
 * (X new / Y updated / Z skipped because already current) so the
 * coach knows what happened.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Loader2 } from "lucide-react";
import { syncEngagementMeetings } from "@/lib/actions/sync-engagement-meetings";

export function SyncMeetingsButton({
  engagementId,
}: {
  engagementId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  function go() {
    setMessage(null);
    startTransition(async () => {
      const r = await syncEngagementMeetings(engagementId);
      if (!r.ok) {
        setMessage({ tone: "err", text: r.error });
        return;
      }
      const { inserted, updated, skipped } = r.data;
      if (inserted === 0 && updated === 0 && skipped === 0) {
        setMessage({
          tone: "ok",
          text: "Synced — no Fireflies meetings found for this engagement yet.",
        });
      } else {
        setMessage({
          tone: "ok",
          text: `Synced: ${inserted} new, ${updated} updated, ${skipped} already current.`,
        });
      }
      router.refresh();
      setTimeout(() => setMessage(null), 10_000);
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60 shadow-tbb-cta"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <CloudDownload className="w-3.5 h-3.5" aria-hidden />
        )}
        {isPending ? "Syncing…" : "Sync from Fireflies"}
      </button>
      {message && (
        <p
          role="status"
          className={
            "text-xs px-3 py-1.5 rounded-md " +
            (message.tone === "ok"
              ? "bg-tbb-success/10 text-tbb-ink-2 border border-tbb-success/30"
              : "bg-tbb-danger/10 text-tbb-danger border border-tbb-danger/30")
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
