import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementInvoices } from "@/lib/db/queries/invoices";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const STATUS_TONE: Record<string, string> = {
  draft: "text-muted-foreground",
  sent: "text-foreground",
  paid: "text-tbb-navy font-bold",
  overdue: "text-tbb-danger font-bold",
  void: "text-muted-foreground line-through",
};

export default async function PortalInvoicesPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const items = await listEngagementInvoices(engagement.id);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Invoices
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Stripe-driven billing for this engagement. Click any invoice to open the hosted Stripe page.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="border border-tbb-line rounded-md bg-white p-6 space-y-2">
          <p className="font-bold text-foreground text-base tracking-tight">
            No invoices yet
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            Once your subscription is active, invoices appear here. The Stripe webhook integration that auto-populates this list lands in Phase 2.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((inv) => (
            <li key={inv.id} className="py-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="font-bold text-foreground text-base tracking-tight">
                    {inv.number ?? inv.stripeInvoiceId ?? "Invoice"}
                  </span>
                  {inv.description && (
                    <span className="font-sans text-sm text-muted-foreground">
                      {inv.description}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                  {inv.issuedAt && (
                    <>
                      Issued {new Date(inv.issuedAt).toLocaleDateString()} ·{" "}
                    </>
                  )}
                  {inv.dueAt && (
                    <>
                      Due {new Date(inv.dueAt).toLocaleDateString()} ·{" "}
                    </>
                  )}
                  ${(Number(inv.amountCents) / 100).toFixed(2)} {inv.currency}
                </p>
              </div>
              <span
                className={
                  "font-mono text-[10px] uppercase tracking-tbb-caps " +
                  (STATUS_TONE[inv.status] ?? "text-muted-foreground")
                }
              >
                {STATUS_LABEL[inv.status] ?? inv.status}
              </span>
              {inv.hostedInvoiceUrl && (
                <a
                  href={inv.hostedInvoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-navy hover:underline inline-flex items-center gap-1"
                >
                  Stripe <ExternalLink className="w-3 h-3" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
