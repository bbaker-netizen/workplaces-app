import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { emailTemplates, pricingTiers } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { EngagementForm } from "./EngagementForm";

export default async function NewEngagementPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // Pull onboarding-category templates so the form can offer them as
  // "auto-send when the client accepts" options. Pull pricing tiers
  // in parallel — they pre-fill the monthly-fee input on the form.
  const [onboardingTemplates, tiers] = await Promise.all([
    withSystemContext(async (tx) =>
      tx
        .select({
          id: emailTemplates.id,
          name: emailTemplates.name,
          category: emailTemplates.category,
        })
        .from(emailTemplates)
        .where(
          and(
            eq(emailTemplates.orgId, profile.orgId),
            eq(emailTemplates.category, "onboarding"),
          ),
        )
        .orderBy(asc(emailTemplates.name)),
    ),
    withSystemContext(async (tx) =>
      tx
        .select({
          id: pricingTiers.id,
          program: pricingTiers.program,
          tierKey: pricingTiers.tierKey,
          label: pricingTiers.label,
          monthlyFeeCents: pricingTiers.monthlyFeeCents,
          sortOrder: pricingTiers.sortOrder,
        })
        .from(pricingTiers)
        .where(eq(pricingTiers.orgId, profile.orgId))
        .orderBy(asc(pricingTiers.program), asc(pricingTiers.sortOrder)),
    ),
  ]);

  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-10">
        <header className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Business Builder Console
          </p>
          <h1 className="font-bold text-foreground text-4xl sm:text-5xl tracking-tight leading-none">
            New engagement
          </h1>
          <p className="font-sans text-muted-foreground max-w-md leading-relaxed">
            Sets up the client&apos;s private workspace and emails the
            client lead a sign-up invitation. Pick an onboarding email
            template below to auto-fire a personal welcome at the same
            time.
          </p>
        </header>
        <EngagementForm
          onboardingTemplates={onboardingTemplates}
          pricingTiers={tiers}
        />
      </div>
    </main>
  );
}
