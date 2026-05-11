import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachSubscriptions } from "@/lib/db/queries/coach-cross-engagement";

export default async function CoachSubscriptionsCrossPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach")
    redirect("/portal");

  const items = await listCoachSubscriptions();
  const totalMonthly = items.reduce((s, i) => s + i.monthlyCostCents, 0);
  const pendingTransfer = items.filter(
    (i) => i.transferStatus === "pending_transfer",
  );

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Coach Console
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
        </p>
      </header>

      {items.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground italic">
          No subscriptions tracked yet.
        </p>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((s) => (
            <li
              key={s.id}
              className="py-3 flex items-baseline gap-3 flex-wrap"
            >
              <span className="font-bold text-foreground text-base tracking-tight">
                {s.name}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                {s.vendor}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                {s.engagementName}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                ${(s.monthlyCostCents / 100).toFixed(2)} {s.currency}/mo
              </span>
              {s.renewalDate && (
                <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                  Renews {new Date(s.renewalDate).toLocaleDateString()}
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
      )}
    </main>
  );
}
