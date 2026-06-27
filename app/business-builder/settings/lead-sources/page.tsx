import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { withSystemContext } from "@/lib/db/tenant";
import { orgs } from "@/lib/db/schema";
import { LeadSourcesPanel } from "@/components/business-builder/LeadSourcesPanel";

/**
 * Lead sources — master-admin only. Surfaces the lead-capture webhook URL
 * and how to connect each marketing channel to it via Make.com so leads
 * land in the Pipeline automatically.
 */
export default async function LeadSourcesPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin") redirect("/business-builder");

  const token = await withSystemContext(async (tx) => {
    const [m] = await tx
      .select({ token: orgs.leadWebhookToken })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return m?.token ?? null;
  });

  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://builder.4workplaces.com"
  ).replace(/\/+$/, "");

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href="/business-builder/settings"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Settings
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Lead sources
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Connect your website form and ad channels so every new lead lands
          in your Pipeline automatically, tagged with where it came from. You
          point each channel at one secure URL — Make.com does the bridging.
        </p>
      </header>

      <LeadSourcesPanel initialToken={token} baseUrl={baseUrl} />
    </main>
  );
}
