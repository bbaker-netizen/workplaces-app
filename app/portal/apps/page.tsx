import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementEmbeddedApps } from "@/lib/db/queries/embedded-apps";
import { EmbeddedAppList } from "@/components/embedded-apps/EmbeddedAppList";

export default async function PortalAppsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const isCoach =
    profile.role === "master_admin" || profile.role === "coach";
  const apps = await listEngagementEmbeddedApps(engagement.id, !isCoach);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          Apps
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Tools and dashboards built specifically for this engagement.
        </p>
      </header>

      <EmbeddedAppList
        engagementId={engagement.id}
        apps={apps.map((a) => ({
          id: a.id,
          netlifyProjectId: a.netlifyProjectId,
          displayName: a.displayName,
          description: a.description,
          appUrl: a.appUrl,
          authMode: a.authMode,
          isVisible: a.isVisible,
        }))}
        isCoach={isCoach}
      />
    </main>
  );
}
