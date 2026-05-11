import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getUnreadNotificationCount } from "@/lib/db/queries/notifications";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { ALL_MODULES, getEnabledModules } from "@/lib/modules";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { PortalFooter } from "@/components/portal/PortalFooter";
import { PortalTour } from "@/components/portal/PortalTour";

/**
 * /portal/* layout shell. Auth + role gate plus the new lifecycle
 * sidebar (replaces the old horizontal top nav). Redirects users
 * without an active Clerk Org to /no-invitation.
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

  const modules = engagement
    ? await getEnabledModules(profile.orgId, profile.role, engagement.id)
    : ALL_MODULES.filter((m) => m.visibleTo.includes(profile.role));

  return (
    <div className="min-h-screen bg-background flex">
      <PortalSidebar
        fullName={profile.fullName}
        unreadCount={unreadCount}
        modules={modules}
        engagementName={engagement?.name ?? null}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1">{children}</main>
        <PortalFooter />
      </div>
      {/* First-visit interactive tour. localStorage flag keeps it
          from re-firing on every visit. */}
      <PortalTour />
    </div>
  );
}
