import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getUnreadNotificationCount } from "@/lib/db/queries/notifications";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { ALL_MODULES, getEnabledModules } from "@/lib/modules";
import { PortalNav } from "@/components/portal/PortalNav";
import { PortalFooter } from "@/components/portal/PortalFooter";

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

  const [unreadCount, engagement] = await Promise.all([
    getUnreadNotificationCount(),
    getCurrentEngagement(),
  ]);

  // If the user has no engagement, show all modules visible to their
  // role (defaults). With an engagement, filter through assignments.
  const modules = engagement
    ? await getEnabledModules(profile.orgId, profile.role, engagement.id)
    : ALL_MODULES.filter((m) => m.visibleTo.includes(profile.role));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PortalNav
        fullName={profile.fullName}
        unreadCount={unreadCount}
        modules={modules}
      />
      <div className="flex-1">{children}</div>
      <PortalFooter />
    </div>
  );
}
