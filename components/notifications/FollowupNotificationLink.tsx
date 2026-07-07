"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { markNotificationRead } from "@/lib/actions/notifications";

/**
 * Wraps a follow-up reminder in the notifications feed. Follow-up
 * reminders deliberately stay bold (unread) when the feed is opened;
 * clicking one is the "acted on" signal, so we mark it read as the user
 * navigates through to the lead.
 */
export function FollowupNotificationLink({
  notificationId,
  href,
  children,
}: {
  notificationId: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        // Fire-and-forget; navigation proceeds regardless of the result.
        void markNotificationRead(notificationId);
      }}
    >
      {children}
    </Link>
  );
}
