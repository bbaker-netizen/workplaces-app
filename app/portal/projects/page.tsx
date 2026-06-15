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
        <div className="border border-dashed border-tbb-line rounded-xl bg-white p-10 text-center space-y-2">
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
        <ul className="space-y-3">
          {items.map((p) => {
            const pct =
              p.taskCount === 0
                ? 0
                : Math.round((p.taskCountDone / p.taskCount) * 100);
            return (
              <li key={p.id}>
                <Link
                  href={`/portal/projects/${p.id}`}
                  className="block rounded-xl border border-tbb-line bg-white p-4 sm:p-5 shadow-tbb-xs hover:shadow-tbb-sm hover:border-tbb-blue/50 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <span className="font-bold text-foreground text-lg tracking-tight">
                        {p.name}
                      </span>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                        {p.leadName && <span>Lead: {p.leadName}</span>}
                        {p.targetDate && (
                          <span>
                            Target{" "}
                            {new Date(p.targetDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        <span>
                          {p.taskCountDone}/{p.taskCount} tasks · {pct}%
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <ProjectStatusPill status={p.status} />
                      {(p.revenueImpact || p.marginImpact) && (
                        <div className="flex gap-1">
                          {p.revenueImpact && <ImpactBadge>Revenue</ImpactBadge>}
                          {p.marginImpact && <ImpactBadge>Margin</ImpactBadge>}
                        </div>
                      )}
                    </div>
                  </div>
                  {p.taskCount > 0 && (
                    <div className="mt-3 h-1.5 bg-tbb-line-soft rounded-full overflow-hidden">
                      <div
                        className="h-full bg-tbb-success transition-all"
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

const STATUS_PILL: Record<string, string> = {
  planning: "bg-tbb-line-soft text-tbb-ink-2",
  active: "bg-tbb-success text-white",
  blocked: "bg-tbb-danger text-white",
  completed: "bg-tbb-navy text-white",
  cancelled: "bg-tbb-line-soft text-tbb-ink-3 line-through",
};

function ProjectStatusPill({ status }: { status: string }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-tbb-caps whitespace-nowrap " +
        (STATUS_PILL[status] ?? "bg-tbb-line-soft text-tbb-ink-2")
      }
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ImpactBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-tbb-blue/50 text-tbb-blue bg-tbb-blue/5 px-2 py-px text-[10px] font-bold uppercase tracking-tbb-caps">
      {children}
    </span>
  );
}
