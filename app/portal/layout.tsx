import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PortalHomeLink } from "@/components/portal/PortalHomeLink";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getUnreadNotificationCount } from "@/lib/db/queries/notifications";
import {
  getCurrentEngagement,
  PORTAL_PREVIEW_COOKIE,
} from "@/lib/db/queries/engagements";
import { getCurrentUserPrefs } from "@/lib/db/queries/user-prefs";
import { ALL_MODULES, getEnabledModules } from "@/lib/modules";
import {
  isEngagementReadOnly,
  readOnlyReason,
} from "@/lib/engagement-lifecycle";
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

  // Coaches belong in their own console, not the client portal. They only
  // land here deliberately via the "Client Portal View" preview button,
  // which sets the preview cookie. Without it, bounce them back to the
  // console — on EVERY portal page, so a stray link or stale bookmark
  // can't strand a coach inside the client portal (#7).
  const isCoachRole =
    profile.role === "master_admin" || profile.role === "coach";
  const inPreview =
    cookies().get(PORTAL_PREVIEW_COOKIE)?.value === "1";
  if (isCoachRole && !inPreview) {
    redirect("/business-builder");
  }

  const [unreadCount, engagement, prefs] = await Promise.all([
    getUnreadNotificationCount(),
    getCurrentEngagement(),
    getCurrentUserPrefs(),
  ]);

  // Archived engagement = the client relationship is closed. Coaches
  // previewing fall back to a live engagement (getCurrentEngagement skips
  // archived), so an archived engagement here means an actual client whose
  // access has ended — show a closed-portal notice instead of the modules.
  if (engagement?.archivedAt && !isCoachRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="font-bold text-foreground text-2xl tracking-tight">
            This portal is closed
          </h1>
          <p className="text-sm text-muted-foreground">
            Your engagement has wrapped up, so portal access is paused. If you
            think this is a mistake, reach out to your Business Builder.
          </p>
        </div>
      </div>
    );
  }

  const modules = engagement
    ? await getEnabledModules(profile.orgId, profile.role, engagement.id)
    : ALL_MODULES.filter((m) => m.visibleTo.includes(profile.role));

  const readOnly = isEngagementReadOnly(engagement?.status);

  return (
    <div className="min-h-screen bg-background flex">
      <PortalSidebar
        fullName={profile.fullName}
        unreadCount={unreadCount}
        modules={modules}
        // For coaches previewing, omit the name here — the layout is
        // cached across navigation and would go stale when switching
        // clients. Real clients (one fixed engagement) keep their branding.
        engagementName={isCoachRole ? null : (engagement?.name ?? null)}
        pinnedNavItems={prefs.pinnedNavItems}
        collapsedInitial={prefs.sidebarCollapsed}
        isCoach={profile.role === "master_admin" || profile.role === "coach"}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Persistent top bar — always gives a one-click way back to the
            portal home from any module page (documents, sessions, etc.).
            We deliberately DON'T render the engagement name here: this
            layout is preserved across client-side navigation, so when a
            coach switches which client they're previewing the name would
            go stale and show the wrong client. The page's hero + preview
            banner name the client correctly on every render. */}
        <div className="sticky top-0 z-20 border-b border-tbb-line bg-background/95 backdrop-blur px-6 py-2.5 flex items-center gap-3">
          <PortalHomeLink />
        </div>
        {isCoachRole && (
          <div className="border-b border-tbb-blue/30 bg-tbb-blue-50 px-6 py-2.5 text-sm flex items-center gap-x-4 gap-y-1 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
              Coach preview
            </span>
            <span className="text-tbb-ink-2">
              You&apos;re previewing{" "}
              <strong className="text-tbb-navy">
                {engagement?.name ?? "a client portal"}
              </strong>
              . This is what they see.
            </span>
            <a
              href="/business-builder/engagements"
              className="ml-auto inline-flex items-center text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
            >
              Switch client
            </a>
            <a
              href="/home"
              className="inline-flex items-center text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
            >
              Exit preview
            </a>
          </div>
        )}
        {readOnly && (
          <div className="border-b border-tbb-warning/40 bg-tbb-warning/10 px-6 py-3 text-sm text-tbb-ink-2 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-warning">
              {readOnlyReason(engagement?.status)}
            </span>
            <span>
              This engagement is {readOnlyReason(engagement?.status)} — your
              portal is read-only for now. You can still view everything;
              reach out to your Business Builder to pick things back up.
            </span>
          </div>
        )}
        <main className="flex-1">{children}</main>
        <PortalFooter />
      </div>
      {/* First-visit interactive tour. localStorage flag keeps it
          from re-firing on every visit. */}
      <PortalTour />
    </div>
  );
}
