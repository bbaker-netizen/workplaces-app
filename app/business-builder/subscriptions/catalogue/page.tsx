/**
 * /business-builder/subscriptions/catalogue — the product catalogue Bruce sells.
 * Each product can be assigned to many engagements. Inline create /
 * edit / delete + an "Assign to engagement" pop-out per product.
 */

import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  subscriptionProducts,
} from "@/lib/db/schema";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { withSystemContext } from "@/lib/db/tenant";
import { SubscriptionCatalogueManager } from "@/components/subscriptions/SubscriptionCatalogueManager";

export default async function SubscriptionCataloguePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const [products, engagements] = await Promise.all([
    withSystemContext(async (tx) =>
      tx
        .select()
        .from(subscriptionProducts)
        .where(eq(subscriptionProducts.orgId, profile.orgId))
        .orderBy(desc(subscriptionProducts.updatedAt)),
    ),
    listCoachEngagements(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-1">
        <p className="tbb-eyebrow">Subscriptions</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Product catalogue
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          The services you sell as recurring subscriptions — your
          Netlify-hosted apps, automation builds, retainers, anything.
          Build the catalogue once, assign products to specific clients
          as they sign on. Each per-client assignment lives in their
          engagement&apos;s subscriptions list.
        </p>
      </header>

      <SubscriptionCatalogueManager
        initialProducts={products}
        engagements={engagements.map((e) => ({
          id: e.id,
          name: e.name ?? "Engagement",
        }))}
      />
    </main>
  );
}
