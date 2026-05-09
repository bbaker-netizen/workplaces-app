import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementGoals } from "@/lib/db/queries/goals";
import { GoalCard } from "@/components/goals/GoalCard";

export default async function PortalGoalsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-display font-bold text-foreground text-3xl tracking-tight">
          No engagement yet
        </h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Your portal isn&apos;t bound to an engagement.
        </p>
      </main>
    );
  }

  const canCreate =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  const goals = await listEngagementGoals(engagement.id);
  // Sort: active (open / in_progress) first, then achieved, then others.
  const order = (s: string) =>
    s === "in_progress"
      ? 0
      : s === "open"
        ? 1
        : s === "missed"
          ? 2
          : s === "achieved"
            ? 3
            : 4;
  goals.sort((a, b) => order(a.status) - order(b.status));

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {engagement.name ?? "Engagement"}
          </p>
          <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
            Goals
          </h1>
          <p className="font-sans text-sm text-muted-foreground">
            SMART goals tied to top-line revenue or margin.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/portal/goals/new"
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.15em] px-4 py-2 rounded-md bg-[#1A1A1A] text-[#F5F1E8] hover:bg-[#2E4057]"
          >
            <Plus className="w-4 h-4" aria-hidden /> New goal
          </Link>
        )}
      </header>

      {goals.length === 0 ? (
        <div className="border border-[#CCCCCC] rounded-md bg-white p-6 space-y-2">
          <p className="font-display font-bold text-foreground text-base tracking-tight">
            No goals set yet
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            {canCreate
              ? "Set the first SMART goal for this engagement above."
              : "Your coach will set goals here as they come into focus."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              href={`/portal/goals/${g.id}`}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
