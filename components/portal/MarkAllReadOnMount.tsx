"use client";

/**
 * Fires markAllNotificationsRead on page mount. Used on the notifications
 * page so visiting it clears the unread count. Per-item read tracking is
 * a Phase 2 polish.
 */

import { useEffect } from "react";
import { markAllNotificationsRead } from "@/lib/actions/notifications";

export function MarkAllReadOnMount() {
  useEffect(() => {
    markAllNotificationsRead().catch(() => {
      // Silent — clearing notifications isn't worth interrupting the
      // user with an error. Server logs the failure if needed.
    });
  }, []);
  return null;
}
