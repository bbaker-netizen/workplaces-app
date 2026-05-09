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
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Coach Console
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Subscriptions inventory · cross-client
        </h1>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
        <p className="font-sans text-sm text-muted-foreground">
          {items.length} services · ${(totalMonthly / 100).toFixed(2)} / mo total run-rate
          {pendingTransfer.length > 0 && (
            <>
              {" · "}
              <span className="text-[#E87722] font-bold">
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
        <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
          {items.map((s) => (
            <li
              key={s.id}
              className="py-3 flex items-baseline gap-3 flex-wrap"
            >
              <span className="font-display font-bold text-foreground text-base tracking-tight">
                {s.name}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {s.vendor}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {s.engagementName}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                ${(s.monthlyCostCents / 100).toFixed(2)} {s.currency}/mo
              </span>
              {s.renewalDate && (
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Renews {new Date(s.renewalDate).toLocaleDateString()}
                </span>
              )}
              <span
                className={
                  "ml-auto font-mono text-[10px] uppercase tracking-[0.2em] " +
                  (s.transferStatus === "pending_transfer"
                    ? "text-[#E87722] font-bold"
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
