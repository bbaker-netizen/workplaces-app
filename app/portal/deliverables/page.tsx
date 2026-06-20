import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
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
  // Deliverables are produced by Workplaces, not the client. Clients view
  // them read-only; their own to-dos live in Action Items.
  const canEdit = profile.role === "master_admin" || profile.role === "coach";

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
          The 9 methodology-defined artifacts Workplaces builds for you over
          the engagement. Each tracks status from not started → delivered.
        </p>
      </header>

      {!canEdit && (
        <div className="border border-tbb-line rounded-md bg-tbb-cream-50 px-4 py-3 flex items-start gap-2">
          <p className="font-sans text-sm text-muted-foreground">
            These are produced by your Business Builder. Got a to-do of your
            own? Track it in{" "}
            <Link
              href="/portal/action-items"
              className="text-tbb-navy font-bold underline underline-offset-2 inline-flex items-center gap-0.5"
            >
              Action Items <ArrowRight className="w-3 h-3" aria-hidden />
            </Link>
            .
          </p>
        </div>
      )}

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
          completedByName: d.completedByName,
        }))}
        canEdit={canEdit}
      />
    </main>
  );
}
