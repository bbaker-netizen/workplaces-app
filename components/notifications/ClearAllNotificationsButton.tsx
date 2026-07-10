"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { clearAllNotifications } from "@/lib/actions/notifications";

/** Clears (deletes) all of the signed-in user's notifications. */
export function ClearAllNotificationsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await clearAllNotifications();
          router.refresh();
        });
      }}
      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-ink-2 hover:border-tbb-danger hover:text-tbb-danger transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" aria-hidden />
      {pending ? "Clearing…" : "Clear all"}
    </button>
  );
}
