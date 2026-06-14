import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import {
  listEngagementEmbeddedApps,
  listMyFavouriteAppIds,
} from "@/lib/db/queries/embedded-apps";
import { EmbeddedAppList } from "@/components/embedded-apps/EmbeddedAppList";
import { appUrlWithToken } from "@/lib/embedded-apps/token";

export default async function PortalAppsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const isCoach =
    profile.role === "master_admin" || profile.role === "coach";
  const [apps, favouriteIds] = await Promise.all([
    listEngagementEmbeddedApps(engagement.id, !isCoach),
    listMyFavouriteAppIds(),
  ]);
  const favSet = new Set(favouriteIds);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
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
          instructions: a.instructions,
          isFavourite: favSet.has(a.id),
          // For token_passthrough auth mode, sign a fresh short-lived
          // token and stitch it onto the URL the iframe loads. Tokens
          // expire in 5 minutes; refresh strategy on the embedded app
          // side is up to that app (it can request a new token via
          // a postMessage round-trip if needed).
          appUrl:
            a.authMode === "token_passthrough"
              ? appUrlWithToken(a.appUrl, {
                  engagementId: engagement.id,
                  userProfileId: profile.userProfileId,
                  email: profile.email,
                  role: profile.role,
                })
              : a.appUrl,
          authMode: a.authMode,
          isVisible: a.isVisible,
        }))}
        isCoach={isCoach}
      />
    </main>
  );
}
