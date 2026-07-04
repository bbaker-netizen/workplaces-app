import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { LeadImporter } from "@/components/business-builder/LeadImporter";
import { PhoneCleanup } from "@/components/business-builder/PhoneCleanup";

/**
 * Bulk lead reconcile/import — upload a spreadsheet (.xlsx) or CSV to fill in
 * missing phones/names on existing prospects (never overwrites, never touches
 * notes) and add new ones. Linked from the Tools group in the sidebar.
 */
export default async function ImportLeadsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/business-builder/pipeline"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Pipeline
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Import / update leads
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Reconcile a spreadsheet of leads against your Pipeline. Matches by
          email and fills in only what&apos;s missing — safe to run anytime.
        </p>
      </header>

      <PhoneCleanup />
      <LeadImporter />
    </main>
  );
}
