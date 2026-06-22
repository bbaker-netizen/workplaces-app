import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentUserPrefs } from "@/lib/db/queries/user-prefs";
import { getBusinessBuilderPulse } from "@/lib/db/queries/business-builder-pulse";
import { getCurrentBbAccess } from "@/lib/db/queries/bb-access";
import { getBuilderOnboardingState } from "@/lib/db/queries/onboarding";
import { BusinessBuilderSidebar } from "@/components/business-builder/BusinessBuilderSidebar";
import { BusinessBuilderOnboarding } from "@/components/business-builder/BusinessBuilderOnboarding";
import { PortalFooter } from "@/components/portal/PortalFooter";
import { BusinessBuilderTour } from "@/components/business-builder/BusinessBuilderTour";
import { BuilderBuddy } from "@/components/mascot/BuilderBuddy";

/**
 * Business Builder Console layout — role gate + lifecycle sidebar.
 *
 * Only master_admin and Coach roles reach the Business Builder side. Anyone else
 * gets bounced to /portal.
 */
export default async function BusinessBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await ensureUserProfile();
  if (result.status !== "ok") redirect("/no-invitation");
  if (result.role !== "master_admin" && result.role !== "coach") {
    redirect("/portal");
  }

  const [prefs, pulse, access, onboarding] = await Promise.all([
    getCurrentUserPrefs(),
    getBusinessBuilderPulse(),
    getCurrentBbAccess(),
    getBuilderOnboardingState(),
  ]);

  return (
    <div className="min-h-screen bg-background flex">
      <BusinessBuilderSidebar
        fullName={result.fullName}
        isMasterAdmin={result.role === "master_admin"}
        allowedConsoleModules={access.allowedConsoleModules}
        pinnedNavItems={prefs.pinnedNavItems}
        collapsedInitial={prefs.sidebarCollapsed}
        pulse={pulse}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1">{children}</main>
        <PortalFooter />
      </div>
      {/* First-login welcome + setup checklist for newly-invited Business
          Builders. Shows once, gated server-side. */}
      <BusinessBuilderOnboarding state={onboarding} />
      {/* First-visit workflow walkthrough. Suppressed while the welcome
          checklist is up so the two overlays don't collide. */}
      <BusinessBuilderTour suppressAuto={onboarding.needsOnboarding} />
      {/* Builder Buddy — friendly mascot tucked into the corner that
          surfaces page-specific tips when clicked. Dismissible per
          page or globally. */}
      <BuilderBuddy />
    </div>
  );
}
