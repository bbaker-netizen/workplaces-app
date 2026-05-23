import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { getSoulFileForEngagement } from "@/lib/db/queries/soul-files";
import { SoulFileEditor } from "@/components/soul-file/SoulFileEditor";

export default async function PortalSoulFilePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-bold text-foreground text-3xl tracking-tight">
          No engagement yet
        </h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Your portal isn&apos;t bound to an engagement. If you expect access,
          contact your Coach.
        </p>
      </main>
    );
  }

  const soulFile = await getSoulFileForEngagement(engagement.id);

  const canEdit =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Soul File
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          The deep context for this engagement — why it exists, where it&apos;s
          going, and what shapes the work.
        </p>
      </header>

      <SoulFileEditor
        engagementId={engagement.id}
        initialBody={soulFile?.body ?? ""}
        initialUpdatedAt={soulFile?.updatedAt ?? null}
        initialLastEditorName={soulFile?.lastEditorName ?? null}
        canEdit={canEdit}
      />
    </main>
  );
}
