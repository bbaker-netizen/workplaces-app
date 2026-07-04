import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { FacebookLeadFixer } from "@/components/business-builder/FacebookLeadFixer";

/**
 * One-time repair for the 29 Facebook leads whose phone column was
 * corrupted by an earlier bad import. Writes only the phone + lead source,
 * matched by email, from verified values. Linked from the Tools group.
 */
export default async function FixFacebookLeadsPage() {
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
          Fix Facebook lead phone numbers
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Restores the correct phone number and lead source on the 29 Facebook
          leads, matched by email. Only those two fields are touched — nothing
          else on the record changes.
        </p>
      </header>

      <FacebookLeadFixer />
    </main>
  );
}
