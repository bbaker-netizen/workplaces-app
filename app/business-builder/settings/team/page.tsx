/**
 * /business-builder/settings/team — manage internal users (Business
 * Builders). Master admins invite teammates like Jen as standard
 * Business Builders (no system settings) or co-admins, and adjust an
 * existing user's access level here.
 *
 * Master admins only — bounced to the console otherwise.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listInternalUsers } from "@/lib/db/queries/business-builders";
import { BusinessBuildersManager } from "@/components/business-builder/BusinessBuildersManager";

export default async function BusinessBuildersSettingsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin") {
    redirect("/business-builder");
  }

  const users = await listInternalUsers();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/business-builder/settings"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Settings
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Business Builders
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          The people who run the practice. Standard Business Builders get
          the full coaching console but can&apos;t reach system settings
          (integrations, company info, pricing, this page). Master admins
          get everything.
        </p>
      </header>

      <BusinessBuildersManager
        users={users}
        currentUserProfileId={profile.userProfileId}
      />
    </main>
  );
}
