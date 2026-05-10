/**
 * Coach invoice creation — Phase 4.6.
 *
 * Pick an engagement, add line items, optional due date, optional
 * memo, pick provider (QBO default, Stripe optional), send. The
 * server action creates the invoice in the chosen provider and
 * mirrors it into our `invoices` table.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { qboOauthTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { CreateInvoiceForm } from "@/components/invoices/CreateInvoiceForm";

export default async function NewInvoicePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const [engagements, qboConnected] = await Promise.all([
    listCoachEngagements(),
    withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ id: qboOauthTokens.id })
        .from(qboOauthTokens)
        .where(eq(qboOauthTokens.coachUserProfileId, profile.userProfileId))
        .limit(1);
      return Boolean(row);
    }),
  ]);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Coach Console
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Create invoice
        </h1>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
      </header>

      {!qboConnected && (
        <div className="border border-[#E87722] bg-white rounded-md px-4 py-3">
          <p className="font-display font-bold text-[#E87722] text-base">
            QuickBooks not connected.
          </p>
          <p className="font-sans text-sm text-foreground">
            Connect at{" "}
            <Link
              href="/coach/profile/quickbooks"
              className="text-[#2E4057] underline underline-offset-4"
            >
              /coach/profile/quickbooks
            </Link>{" "}
            before creating QBO invoices. Stripe-only invoices still
            require a Stripe key in the dashboard.
          </p>
        </div>
      )}

      <CreateInvoiceForm
        engagements={engagements.map((e) => ({
          id: e.id,
          name: e.name ?? `Engagement ${e.id.slice(0, 8)}`,
        }))}
        qboConnected={qboConnected}
      />
    </main>
  );
}
