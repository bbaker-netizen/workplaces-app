import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getUnreadNotificationCount } from "@/lib/db/queries/notifications";
import { PortalNav } from "@/components/portal/PortalNav";

/**
 * /portal/* layout shell. Auth + role gate plus the shared nav.
 * Redirects users without an active Clerk Org to /no-invitation.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    redirect("/no-invitation");
  }

  const unreadCount = await getUnreadNotificationCount();

  return (
    <div className="min-h-screen bg-background">
      <PortalNav fullName={profile.fullName} unreadCount={unreadCount} />
      {children}
    </div>
  );
}
