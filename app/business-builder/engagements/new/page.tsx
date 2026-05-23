import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { emailTemplates, pricingTiers, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { EngagementForm } from "./EngagementForm";
import { ProspectPicker } from "./ProspectPicker";

export default async function NewEngagementPage({
  searchParams,
}: {
  searchParams: Promise<{ prospectId?: string }>;
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const { prospectId } = await searchParams;

  // If we landed here via "Convert to engagement" on a prospect page,
  // load the prospect so we can pre-fill the form fields. Saves Bruce
  // retyping name / email / program / fee — everything the prospect
  // record already knows.
  const prefillProspect = prospectId
    ? await withSystemContext(async (tx) => {
        const [p] = await tx
          .select()
          .from(prospects)
          .where(eq(prospects.id, prospectId))
          .limit(1);
        return p ?? null;
      })
    : null;

  // Eligible prospects for the "Start from a prospect" picker —
  // anyone in contract_sent / contract_signed / negotiation /
  // proposal_sent stages who hasn't already been converted. Lets
  // Bruce convert from this page if he didn't come in via a
  // prospect's "Convert to engagement" button.
  const eligibleProspects = await withSystemContext(async (tx) =>
    tx
      .select({
        id: prospects.id,
        companyName: prospects.companyName,
        contactName: prospects.contactName,
        status: prospects.status,
      })
      .from(prospects)
      .where(
        and(
          inArray(prospects.status, [
            "proposal_sent",
            "negotiation",
            "contract_sent",
            "contract_signed",
          ]),
          isNull(prospects.convertedEngagementId),
        ),
      )
      .orderBy(desc(prospects.updatedAt))
      .limit(50),
  );

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
        {prefillProspect && (
          <div className="border border-tbb-blue/30 bg-tbb-blue-50 rounded-md px-4 py-3 text-sm text-tbb-navy">
            <p className="font-bold">
              Pre-filled from {prefillProspect.companyName}
            </p>
            <p className="text-xs text-tbb-ink-3 mt-0.5">
              We&apos;ve copied this prospect&apos;s contact, program, and
              fee details across. Confirm or adjust, then click Create.
            </p>
          </div>
        )}
        {!prefillProspect && (
          <ProspectPicker prospects={eligibleProspects} />
        )}
        <EngagementForm
          onboardingTemplates={onboardingTemplates}
          pricingTiers={tiers}
          prefill={
            prefillProspect
              ? {
                  prospectId: prefillProspect.id,
                  engagementName: prefillProspect.companyName,
                  clientLeadFullName: prefillProspect.contactName ?? "",
                  clientLeadEmail: prefillProspect.contactEmail,
                  programType:
                    prefillProspect.programType === "accelerator" ||
                    prefillProspect.programType === "implementer"
                      ? prefillProspect.programType
                      : "",
                  pricingTier: prefillProspect.pricingTier ?? "",
                  monthlyFeeCents: prefillProspect.monthlyFeeCents,
                  startDate: prefillProspect.expectedStartDate
                    ? new Date(prefillProspect.expectedStartDate)
                        .toISOString()
                        .slice(0, 10)
                    : "",
                }
              : null
          }
        />
      </div>
    </main>
  );
}
