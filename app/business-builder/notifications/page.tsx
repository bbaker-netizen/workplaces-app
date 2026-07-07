import { redirect } from "next/navigation";

/**
 * Notifications moved under Settings (Settings → Notifications).
 * This route now permanently redirects there so old bookmarks and any
 * lingering links keep working.
 */
export default function NotificationsMovedRedirect() {
  redirect("/business-builder/settings/notifications");
}
