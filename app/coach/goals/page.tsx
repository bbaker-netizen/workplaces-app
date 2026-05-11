import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachGoals } from "@/lib/db/queries/coach-cross-engagement";

export default async function CoachGoalsCrossPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach")
    redirect("/portal");

  const items = await listCoachGoals();
  const now = new Date();

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Goals · cross-client
        </h1>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground italic">
          No goals yet.
        </p>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((g) => {
            const overdue =
              g.targetDate &&
              g.targetDate < now &&
              g.status !== "achieved" &&
              g.status !== "abandoned";
            return (
              <li key={g.id}>
                <Link
                  href={`/portal/goals/${g.id}`}
                  className={
                    "block py-3 pl-4 border-l-2 hover:bg-tbb-cream-50 transition-colors group " +
                    (overdue ? "border-tbb-danger" : "border-transparent")
                  }
                >
                  <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                    <span className="font-bold text-foreground text-base tracking-tight group-hover:underline underline-offset-4">
                      {g.title}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                      {g.engagementName ?? "Engagement"}
                    </span>
                    <span
                      className={
                        "ml-auto font-mono text-[10px] uppercase tracking-tbb-caps " +
                        (overdue
                          ? "text-tbb-danger font-bold"
                          : "text-muted-foreground")
                      }
                    >
                      {overdue && g.status === "open"
                        ? "Past target"
                        : g.status.replace("_", " ")}
                    </span>
                  </div>
                  {g.targetDate && (
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                      By {new Date(g.targetDate).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
