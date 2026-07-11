import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listChannelSpend } from "@/lib/actions/channel-spend";
import { ChannelSpendPanel } from "@/components/business-builder/ChannelSpendPanel";

/**
 * Channel spend — master-admin only. Hand-enter what was spent per
 * channel per month; it powers the cost-per columns of the lead-source
 * attribution report. No ad-platform API by design.
 */
export default async function ChannelSpendPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin") redirect("/business-builder");

  const rows = await listChannelSpend();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/business-builder/reports"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Reports
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Channel spend
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Enter what you spent on each channel, one month at a time. The
          attribution report divides this by booked sessions and clients to
          show what each channel actually costs. Leave a channel out and its
          cost columns simply show a dash.
        </p>
      </header>

      <ChannelSpendPanel initialRows={rows} />
    </main>
  );
}
