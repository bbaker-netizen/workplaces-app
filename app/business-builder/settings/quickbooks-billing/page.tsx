import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { QboBillingDefaults } from "@/components/settings/QboBillingDefaults";
import { CardPaymentUrlEditor } from "@/components/settings/CardPaymentUrlEditor";

export const dynamic = "force-dynamic";

export default async function QuickBooksBillingSettingsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  // Which account revenue posts to is a practice-owner decision.
  if (profile.role !== "master_admin") redirect("/business-builder");

  const org = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        itemId: orgs.qboServiceItemId,
        itemName: orgs.qboServiceItemName,
        taxCodeId: orgs.qboTaxCodeId,
        taxCodeName: orgs.qboTaxCodeName,
        cardPaymentUrl: orgs.cardPaymentUrl,
      })
      .from(orgs)
      .where(eq(orgs.id, profile.orgId))
      .limit(1);
    return row ?? null;
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Settings
        </p>
        <h1 className="font-bold text-foreground text-3xl tracking-tight leading-none">
          QuickBooks billing
        </h1>
        <Link
          href="/business-builder/settings"
          className="inline-block font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          &larr; Settings
        </Link>
      </header>

      <QboBillingDefaults
        initialItemId={org?.itemId ?? null}
        initialItemName={org?.itemName ?? null}
        initialTaxCodeId={org?.taxCodeId ?? null}
        initialTaxCodeName={org?.taxCodeName ?? null}
      />

      <CardPaymentUrlEditor current={org?.cardPaymentUrl ?? null} />

      <p className="font-sans text-xs text-tbb-ink-3">
        Once this is set, a client&apos;s monthly retainer can be created as a
        recurring invoice from their workspace. It is created inactive and
        unsent &mdash; you review and activate it in QuickBooks, so nothing
        bills a client until you say so.
      </p>
    </main>
  );
}
