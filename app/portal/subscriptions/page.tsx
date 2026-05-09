import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementSubscriptions } from "@/lib/db/queries/subscriptions";
import { SubscriptionsManager } from "@/components/subscriptions/SubscriptionsManager";

export default async function PortalSubscriptionsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const items = await listEngagementSubscriptions(engagement.id);
  const canEdit =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  const totalMonthly = items.reduce(
    (sum, s) => sum + Number(s.monthlyCostCents),
    0,
  );

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          Subscriptions & assets
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          External services maintained for this engagement. Total monthly run-rate:{" "}
          <span className="font-mono text-foreground">
            ${(totalMonthly / 100).toFixed(2)}
          </span>
          .
        </p>
      </header>

      <SubscriptionsManager
        engagementId={engagement.id}
        items={items.map((s) => ({
          id: s.id,
          name: s.name,
          vendor: s.vendor,
          monthlyCostCents: Number(s.monthlyCostCents),
          currency: s.currency,
          paidBy: s.paidBy,
          model: s.model,
          transferStatus: s.transferStatus,
          notes: s.notes,
          renewalDate: s.renewalDate,
        }))}
        canEdit={canEdit}
      />
    </main>
  );
}
