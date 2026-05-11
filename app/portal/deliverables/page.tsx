import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementDeliverables } from "@/lib/db/queries/deliverables";
import { DeliverablesBoard } from "@/components/deliverables/DeliverablesBoard";

export default async function PortalDeliverablesPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const items = await listEngagementDeliverables(engagement.id);
  const canEdit =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Deliverables
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          The 9 methodology-defined deliverable types. Each tracks status from not started → delivered.
        </p>
      </header>

      <DeliverablesBoard
        engagementId={engagement.id}
        items={items.map((d) => ({
          id: d.id,
          type: d.type,
          title: d.title,
          description: d.description,
          status: d.status,
          documentId: d.documentId,
          deliveredAt: d.deliveredAt,
        }))}
        canEdit={canEdit}
      />
    </main>
  );
}
