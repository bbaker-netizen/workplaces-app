/**
 * /coach/settings/pricing — manage the per-org pricing tiers that
 * pre-fill the monthly-fee input when creating an engagement.
 *
 * Six default rows are seeded for every org by migration 0035
 * (Accelerator small/mid/large + Implementer small/mid/large). This
 * page lets Bruce edit or extend that grid for his actual rates.
 */

import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { pricingTiers } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { PricingTiersManager } from "@/components/settings/PricingTiersManager";

export default async function PricingSettingsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const tiers = await withSystemContext(async (tx) =>
    tx
      .select()
      .from(pricingTiers)
      .where(eq(pricingTiers.orgId, profile.orgId))
      .orderBy(asc(pricingTiers.program), asc(pricingTiers.sortOrder)),
  );

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-1">
        <p className="tbb-eyebrow">Settings</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Pricing tiers
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          The price grid that suggests a monthly fee when you create a
          new engagement. Picking a tier is optional — you can always
          type a custom fee — but having the right tiers here saves
          retyping. Used to auto-fill the{" "}
          <code className="px-1 py-0.5 bg-tbb-cream-50 rounded font-mono">
            {`{{monthly_fee}}`}
          </code>{" "}
          placeholder in contracts.
        </p>
      </header>

      <PricingTiersManager
        initialTiers={tiers.map((t) => ({
          id: t.id,
          program: t.program,
          tierKey: t.tierKey,
          label: t.label,
          monthlyFeeCents: t.monthlyFeeCents,
          sortOrder: t.sortOrder,
        }))}
      />
    </main>
  );
}
