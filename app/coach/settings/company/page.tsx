/**
 * /coach/settings/company — edit the org's business info. The
 * fields here flow into contract preambles, invoice headers, the
 * "from" line on transactional emails, etc.
 *
 * Master admins only. The page returns 403-ish friendly redirect for
 * coaches.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { orgs } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { CompanyInfoForm } from "@/components/settings/CompanyInfoForm";

export default async function CompanySettingsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin") {
    redirect("/coach/settings");
  }

  const [org] = await withSystemContext(async (tx) =>
    tx.select().from(orgs).where(eq(orgs.id, profile.orgId)).limit(1),
  );

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/coach/settings"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Settings
        </Link>
        <p className="tbb-eyebrow">Settings</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Company info
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Your business&apos;s legal name, address, and tax info. These
          fields fill in the &quot;from&quot; side of contracts (e.g. the
          BBA&apos;s &quot;HR All-In Inc., operating as Workplaces, in the
          Province of Alberta&quot; preamble) and the header on every
          invoice. Set once, used everywhere.
        </p>
      </header>

      <CompanyInfoForm
        initial={{
          name: org?.name ?? "",
          legalName: org?.legalName ?? "",
          businessAddress: org?.businessAddress ?? "",
          businessCity: org?.businessCity ?? "",
          businessProvince: org?.businessProvince ?? "",
          businessCountry: org?.businessCountry ?? "",
          businessPostalCode: org?.businessPostalCode ?? "",
          businessPhone: org?.businessPhone ?? "",
          businessWebsite: org?.businessWebsite ?? "",
          taxId: org?.taxId ?? "",
        }}
      />
    </main>
  );
}
