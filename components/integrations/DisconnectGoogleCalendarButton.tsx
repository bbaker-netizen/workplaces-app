"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { disconnectGoogleCalendar } from "@/lib/actions/google-calendar";

export function DisconnectGoogleCalendarButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function onClick() {
    if (
      !confirm(
        "Disconnect Google Calendar? Existing events on your Google calendar stay; new sessions will no longer sync.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await disconnectGoogleCalendar();
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-white text-tbb-danger border border-tbb-danger hover:bg-tbb-danger/10 disabled:opacity-50"
    >
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
      Disconnect
    </button>
  );
}
