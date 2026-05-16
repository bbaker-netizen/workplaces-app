import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentUserPrefs } from "@/lib/db/queries/user-prefs";
import { CoachSidebar } from "@/components/coach/CoachSidebar";
import { PortalFooter } from "@/components/portal/PortalFooter";
import { CoachTour } from "@/components/coach/CoachTour";
import { BuilderBuddy } from "@/components/mascot/BuilderBuddy";

/**
 * Business Builder Console layout — role gate + lifecycle sidebar.
 *
 * Only master_admin and Business Builder roles reach the Business Builder side. Anyone else
 * gets bounced to /portal.
 */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await ensureUserProfile();
  if (result.status !== "ok") redirect("/no-invitation");
  if (result.role !== "master_admin" && result.role !== "coach") {
    redirect("/portal");
  }

  const prefs = await getCurrentUserPrefs();

  return (
    <div className="min-h-screen bg-background flex">
      <CoachSidebar
        fullName={result.fullName}
        pinnedNavItems={prefs.pinnedNavItems}
        collapsedInitial={prefs.sidebarCollapsed}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1">{children}</main>
        <PortalFooter />
      </div>
      {/* First-visit workflow walkthrough for new Business Builderes. */}
      <CoachTour />
      {/* Builder Buddy — friendly mascot tucked into the corner that
          surfaces page-specific tips when clicked. Dismissible per
          page or globally. */}
      <BuilderBuddy />
    </div>
  );
}
