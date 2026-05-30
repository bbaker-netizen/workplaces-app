import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementProjects } from "@/lib/db/queries/projects";

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  planning: "text-muted-foreground",
  active: "text-tbb-navy font-bold",
  blocked: "text-tbb-danger font-bold",
  completed: "text-tbb-navy font-bold",
  cancelled: "text-muted-foreground line-through",
};

const STATUS_ORDER: Record<string, number> = {
  active: 0,
  planning: 1,
  blocked: 2,
  completed: 3,
  cancelled: 4,
};

export default async function PortalProjectsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const canCreate =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  const items = await listEngagementProjects(engagement.id);
  items.sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) ||
      a.name.localeCompare(b.name),
  );

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            {engagement.name ?? "Engagement"}
          </p>
          <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
            Projects
          </h1>
          <p className="font-sans text-sm text-muted-foreground">
            Discrete initiatives — app builds, hiring drives, marketing campaigns. Each carries its own task list.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/portal/projects/new"
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
          >
            <Plus className="w-4 h-4" aria-hidden /> New project
          </Link>
        )}
      </header>

      {items.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-md bg-white p-8 text-center space-y-2">
          <p className="text-3xl" aria-hidden>🏗️</p>
          <p className="font-bold text-foreground text-base tracking-tight">
            Nothing under construction yet.
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            {canCreate
              ? "A project is the bigger thing you're building — a hiring system, a new website, a sales playbook. Kick off the first one above."
              : "Your Business Builder will spin up projects here once one's ready to start."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((p) => {
            const pct =
              p.taskCount === 0
                ? 0
                : Math.round((p.taskCountDone / p.taskCount) * 100);
            return (
              <li key={p.id}>
                <Link
                  href={`/portal/projects/${p.id}`}
                  className="block py-4 pl-3 hover:bg-tbb-cream-50 transition-colors group"
                >
                  <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                    <span className="font-bold text-foreground text-lg tracking-tight group-hover:underline underline-offset-4">
                      {p.name}
                    </span>
                    <span
                      className={
                        "ml-auto font-mono text-[10px] uppercase tracking-tbb-caps " +
                        (STATUS_TONE[p.status] ?? "text-muted-foreground")
                      }
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-x-3 gap-y-0.5 flex-wrap font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                    {p.leadName && <span>Lead: {p.leadName}</span>}
                    {p.targetDate && (
                      <span>
                        Target {new Date(p.targetDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                    <span>
                      {p.taskCountDone}/{p.taskCount} tasks · {pct}%
                    </span>
                    <span className="ml-auto flex gap-1">
                      {p.revenueImpact && (
                        <span className="rounded-full border border-tbb-blue text-tbb-navy bg-tbb-cream-50 px-2 py-px">
                          Revenue
                        </span>
                      )}
                      {p.marginImpact && (
                        <span className="rounded-full border border-tbb-blue text-tbb-navy bg-tbb-cream-50 px-2 py-px">
                          Margin
                        </span>
                      )}
                    </span>
                  </div>
                  {p.taskCount > 0 && (
                    <div className="mt-2 h-1 bg-tbb-line rounded-full overflow-hidden">
                      <div
                        className="h-full bg-tbb-blue-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
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
