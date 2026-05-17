import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  listCoachSubscriptions,
  type CoachSubscriptionRow,
} from "@/lib/db/queries/coach-cross-engagement";
import { listCoachEngagements } from "@/lib/db/queries/engagements";

const BILLING_LABEL: Record<string, string> = {
  qbo: "QuickBooks",
  stripe: "Stripe",
};

export default async function CoachSubscriptionsCrossPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach")
    redirect("/portal");

  const [items, engagementList] = await Promise.all([
    listCoachSubscriptions(),
    listCoachEngagements(),
  ]);
  const totalMonthly = items.reduce((s, i) => s + i.monthlyCostCents, 0);
  const pendingTransfer = items.filter(
    (i) => i.transferStatus === "pending_transfer",
  );
  const billedCount = items.filter((i) => i.billingProvider).length;
  const unbilledCount = items.length - billedCount;

  // Group by engagement so the page reads like a tabbed inventory rather
  // than a flat soup of every service across every client.
  const grouped = new Map<
    string,
    { name: string; items: CoachSubscriptionRow[]; total: number }
  >();
  for (const item of items) {
    const key = item.engagementId;
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: item.engagementName ?? "Engagement",
        items: [],
        total: 0,
      });
    }
    const g = grouped.get(key)!;
    g.items.push(item);
    g.total += item.monthlyCostCents;
  }
  // Sort engagements by total run-rate desc — heaviest commitments first.
  const groups = Array.from(grouped.entries())
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => b.total - a.total);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Subscriptions inventory · cross-client
        </h1>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
        <p className="font-sans text-sm text-muted-foreground">
          {items.length} services · ${(totalMonthly / 100).toFixed(2)} / mo total run-rate
          {pendingTransfer.length > 0 && (
            <>
              {" · "}
              <span className="text-tbb-danger font-bold">
                {pendingTransfer.length} transfer pending
              </span>
            </>
          )}
          {items.length > 0 && (
            <>
              {" · "}
              <span className="text-tbb-ink-3">
                {billedCount} linked to billing · {unbilledCount} not yet linked
              </span>
            </>
          )}
        </p>
        <div className="pt-2 flex flex-wrap gap-2">
          <Link
            href="/coach/subscriptions/catalogue"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
          >
            Manage product catalogue
          </Link>
          <span className="self-center text-[11px] text-tbb-ink-3">
            Build the things you sell once. Assign them to clients.
          </span>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-md bg-white p-8 text-center space-y-3">
          <p className="text-3xl" aria-hidden>📋</p>
          <p className="font-bold text-foreground text-base tracking-tight">
            Nothing in the inventory yet.
          </p>
          <p className="font-sans text-sm text-muted-foreground max-w-prose mx-auto">
            Subscription assets are the external services you maintain on a
            client&apos;s behalf — their Netlify-hosted apps, Make.com
            scenarios, custom domains, automation. Two ways to add them:
          </p>
          <ul className="font-sans text-sm text-tbb-ink-2 space-y-1 max-w-prose mx-auto text-left list-disc pl-8">
            <li>
              <strong>From an engagement&apos;s Subscriptions page</strong> —
              fastest for one-offs. Open the engagement → Subscriptions →
              Add subscription.
            </li>
            <li>
              <strong>From the catalogue</strong> — best for things you sell
              multiple times. Build the product once at the catalogue, then
              click <em>Assign to engagement</em>.
            </li>
          </ul>
          <div className="pt-2 flex justify-center gap-2 flex-wrap">
            <Link
              href="/coach/subscriptions/catalogue"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
            >
              Open catalogue
            </Link>
            {engagementList.length > 0 && (
              <Link
                href={`/portal/subscriptions`}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill border border-tbb-line text-tbb-navy hover:bg-tbb-cream-50"
              >
                Add via engagement
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section
              key={g.id}
              className="border border-tbb-line rounded-lg bg-white"
            >
              <header className="flex items-baseline gap-3 px-4 py-3 border-b border-tbb-line-soft flex-wrap">
                <h2 className="font-bold text-foreground text-base tracking-tight">
                  {g.name}
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                  {g.items.length} services · ${(g.total / 100).toFixed(2)} / mo
                </span>
                <Link
                  href={`/coach/documents/${g.id}`}
                  className="ml-auto font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-blue hover:underline"
                >
                  Open engagement →
                </Link>
              </header>
              <ul className="divide-y divide-tbb-line-soft">
                {g.items.map((s) => (
                  <li
                    key={s.id}
                    className="px-4 py-2.5 flex items-baseline gap-3 flex-wrap"
                  >
                    <span className="font-bold text-foreground text-sm tracking-tight">
                      {s.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                      {s.vendor}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                      ${(s.monthlyCostCents / 100).toFixed(2)} {s.currency}/mo
                    </span>
                    {s.renewalDate && (
                      <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                        Renews {new Date(s.renewalDate).toLocaleDateString()}
                      </span>
                    )}
                    {s.billingProvider ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-blue border border-tbb-blue/40 bg-tbb-blue/10 rounded-pill px-2 py-0.5">
                        Billed · {BILLING_LABEL[s.billingProvider] ?? s.billingProvider}
                        {s.billingExternalUrl && (
                          <a
                            href={s.billingExternalUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="hover:underline"
                            title="Open billing record"
                          >
                            <ExternalLink className="w-3 h-3" aria-hidden />
                          </a>
                        )}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3 italic">
                        Not billed yet
                      </span>
                    )}
                    <span
                      className={
                        "ml-auto font-mono text-[10px] uppercase tracking-tbb-caps " +
                        (s.transferStatus === "pending_transfer"
                          ? "text-tbb-danger font-bold"
                          : s.transferStatus === "transferred"
                            ? "text-muted-foreground line-through"
                            : "text-muted-foreground")
                      }
                    >
                      {s.transferStatus.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
