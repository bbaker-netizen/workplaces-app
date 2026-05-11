/**
 * NotificationBell — server-rendered, links to /portal/notifications.
 *
 * Shows a Steel Blue badge with the unread count when > 0. The bell
 * icon is from lucide-react (already in the runtime stack).
 */

import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/portal/notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications (${unreadCount} unread)`
          : "Notifications"
      }
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-md text-foreground hover:bg-[#E5E0D2] transition-colors"
    >
      <Bell className="w-5 h-5" strokeWidth={1.75} />
      {unreadCount > 0 && (
        <span
          className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-tbb-blue-700 text-white text-[10px] font-mono leading-none"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
