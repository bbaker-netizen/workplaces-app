/**
 * /coach/settings/pricing — manage the per-org pricing tiers that
 * pre-fill the monthly-fee input when creating an engagement.
 *
 * Six default rows are seeded for every org by migration 0035
 * (Accelerator small/mid/large + Implementer small/mid/large). This
 * page lets Bruce edit or extend that grid for his actual rates.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
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

  // Defensive load — if the pricing_tiers table doesn't exist yet
  // (migration not run), we'd otherwise crash the page. Catch the
  // throw, surface a friendly message, and tell the user what to do.
  let tiers: Array<typeof pricingTiers.$inferSelect> = [];
  let loadError: string | null = null;
  try {
    tiers = await withSystemContext(async (tx) =>
      tx
        .select()
        .from(pricingTiers)
        .where(eq(pricingTiers.orgId, profile.orgId))
        .orderBy(asc(pricingTiers.program), asc(pricingTiers.sortOrder)),
    );
  } catch (e) {
    console.error("[PricingSettingsPage] load failed:", e);
    loadError =
      e instanceof Error
        ? e.message
        : "Couldn't load pricing tiers from the database.";
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/coach/settings"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Settings
        </Link>
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

      {loadError ? (
        <div className="border border-tbb-danger bg-tbb-cream-50 rounded-lg p-5 space-y-3">
          <p className="font-bold text-tbb-danger">
            Couldn&apos;t load pricing tiers.
          </p>
          <p className="text-sm text-tbb-ink-2">
            The database returned: <code className="font-mono text-xs">{loadError}</code>
          </p>
          <p className="text-sm text-tbb-ink-2">
            Most likely cause: the migration that creates the{" "}
            <code className="font-mono">pricing_tiers</code> table hasn&apos;t
            been run on your Neon database yet. Open the{" "}
            <a
              href="https://console.neon.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="text-tbb-blue underline"
            >
              Neon SQL Editor
            </a>{" "}
            and run the migration from{" "}
            <code className="font-mono text-xs">
              lib/db/migrations/0035_engagement_pricing.sql
            </code>
            . Then refresh this page.
          </p>
        </div>
      ) : (
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
      )}
    </main>
  );
}
