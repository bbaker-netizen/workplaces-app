import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { MarketingImport } from "@/components/marketing/MarketingImport";

/**
 * Import a marketing list from a WordPress / Formidable CSV export.
 * Business Builder side only. The contacts land in the separate marketing
 * list — never in the sales pipeline.
 */
export default async function ImportMarketingPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <Link
        href="/business-builder/marketing"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
      >
        <ArrowLeft className="w-3 h-3" aria-hidden /> Marketing list
      </Link>

      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder · Tools
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          Import marketing list
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Bring the old leads from your WordPress forms into a marketing list.
          These go into a separate list from your sales pipeline — they
          won&apos;t show on the pipeline board or affect your Reports numbers.
        </p>
      </header>

      <section className="rounded-lg border border-tbb-line bg-tbb-cream-50 p-5 space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          How to get the file from WordPress (Formidable)
        </h2>
        <ol className="list-decimal list-inside text-sm text-tbb-ink-2 space-y-1">
          <li>
            In WordPress admin, open <b>Formidable → Forms</b> and click your
            contact / lead form.
          </li>
          <li>
            Go to <b>Entries</b>, then <b>Import/Export</b> (or the{" "}
            <b>Export</b> tab) and choose <b>CSV</b>.
          </li>
          <li>
            Pick the fields (Name, Email, Phone are enough) and download the
            CSV.
          </li>
          <li>Upload it below and hit Preview.</li>
        </ol>
        <p className="text-[11px] text-tbb-ink-3">
          The importer auto-detects the Name, Email, and Phone columns, skips
          rows without a valid email, and de-dupes by email — so re-importing
          the same file won&apos;t create duplicates.
        </p>
      </section>

      <section className="rounded-lg border border-tbb-line bg-white p-5 shadow-tbb-sm">
        <MarketingImport />
      </section>
    </main>
  );
}
