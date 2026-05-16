/**
 * /coach/templates — email template library. Bruce builds reusable
 * onboarding / contract / proposal / follow-up emails here; the
 * communications composer on each prospect / engagement picks them up
 * and prefills subject + body with the prospect's variables resolved.
 */

import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { emailTemplates } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { TemplatesManager } from "@/components/templates/TemplatesManager";

export default async function TemplatesPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const rows = await withSystemContext(async (tx) => {
    return tx
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.orgId, profile.orgId))
      .orderBy(desc(emailTemplates.updatedAt));
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-1">
        <p className="tbb-eyebrow">Communications</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Email templates
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Build your onboarding, contract, proposal and follow-up emails once.
          Use them on any prospect or client — variables like{" "}
          <code className="px-1 py-0.5 bg-tbb-cream-50 rounded">{`{{company_name}}`}</code>{" "}
          and{" "}
          <code className="px-1 py-0.5 bg-tbb-cream-50 rounded">{`{{contact_first_name}}`}</code>{" "}
          fill in automatically.
        </p>
      </header>

      <TemplatesManager initialTemplates={rows} />
    </main>
  );
}
