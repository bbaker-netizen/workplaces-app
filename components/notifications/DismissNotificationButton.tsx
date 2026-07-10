"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { deleteNotification } from "@/lib/actions/notifications";

/** Small X that dismisses (deletes) a single notification from the feed. */
export function DismissNotificationButton({
  notificationId,
}: {
  notificationId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Dismiss notification"
      title="Dismiss"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await deleteNotification(notificationId);
          router.refresh();
        });
      }}
      className="flex-none self-center w-8 h-8 grid place-items-center rounded-md text-tbb-ink-4 hover:text-tbb-danger hover:bg-tbb-danger/10 transition-colors disabled:opacity-50"
    >
      <X className="w-4 h-4" aria-hidden />
    </button>
  );
}
