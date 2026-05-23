/**
 * /coach/engagements/[id] — engagement detail with the Workspace
 * view as its main content. Shows the proper three-tier hierarchy
 * the coach + client both need:
 *
 *   GOAL (the destination)
 *     └── PROJECT (the body of work)
 *           └── ACTION ITEM (the specific commitment)
 *
 * Plus an "Unassigned" bucket for projects without a goal and for
 * action items without a project (one-off commitments from
 * conversations).
 *
 * For now this is a read view that renders the hierarchy. CRUD
 * stays on the existing module pages (/coach/goals,
 * /coach/projects, /coach/action-items) — the Workspace is the
 * single overview the coach + client land on.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Flag,
  Target,
  Workflow,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  actionItems,
  engagements,
  goals,
  projects,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // Load everything in one server hop.
  const data = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.id, id))
      .limit(1);
    if (!eng) return null;

    const [goalRows, projectRows, actionRows] = await Promise.all([
      tx
        .select()
        .from(goals)
        .where(eq(goals.engagementId, id))
        .orderBy(asc(goals.targetDate), asc(goals.createdAt)),
      tx
        .select()
        .from(projects)
        .where(eq(projects.engagementId, id))
        .orderBy(asc(projects.targetDate), asc(projects.createdAt)),
      tx
        .select()
        .from(actionItems)
        .where(eq(actionItems.engagementId, id))
        .orderBy(asc(actionItems.dueDate), asc(actionItems.createdAt)),
    ]);
    return { eng, goals: goalRows, projects: projectRows, actions: actionRows };
  });

  if (!data) notFound();

  // Bucket the data into the tree shape the UI expects.
  const projectsByGoal = new Map<string | "unassigned", typeof data.projects>();
  for (const p of data.projects) {
    const key = p.goalId ?? "unassigned";
    if (!projectsByGoal.has(key)) projectsByGoal.set(key, []);
    projectsByGoal.get(key)!.push(p);
  }
  const actionsByProject = new Map<
    string | "unassigned",
    typeof data.actions
  >();
  for (const a of data.actions) {
    const key = a.projectId ?? "unassigned";
    if (!actionsByProject.has(key)) actionsByProject.set(key, []);
    actionsByProject.get(key)!.push(a);
  }

  const orphanProjects = projectsByGoal.get("unassigned") ?? [];
  const orphanActions = actionsByProject.get("unassigned") ?? [];

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/coach/engagements"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Engagements
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          {data.eng.name ?? "Engagement"}
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          The Workspace: every goal, project, and action item for this
          client, nested the way they relate to each other. Goals at
          the top, the bodies of work under them, the specific
          commitments under those.
        </p>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1.5 text-tbb-ink-3">
            <Target className="w-3.5 h-3.5" aria-hidden />
            {data.goals.length} goal{data.goals.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-tbb-ink-3">
            <Workflow className="w-3.5 h-3.5" aria-hidden />
            {data.projects.length} project
            {data.projects.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-tbb-ink-3">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
            {data.actions.length} action item
            {data.actions.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {data.goals.length === 0 && data.projects.length === 0 && data.actions.length === 0 && (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-2">
          <Target className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">No work captured yet.</p>
          <p className="text-sm text-tbb-ink-3 max-w-md mx-auto">
            Start with one goal — &quot;What does winning look like 12 months
            out?&quot; — then build projects under it, then capture action
            items inside each project as you go through sessions.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Link
              href={`/coach/goals/new?engagement=${id}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
            >
              <Target className="w-3.5 h-3.5" aria-hidden /> Add first goal
            </Link>
          </div>
        </div>
      )}

      {/* Goals + their projects + action items */}
      {data.goals.map((g) => {
        const goalProjects = projectsByGoal.get(g.id) ?? [];
        return (
          <section
            key={g.id}
            className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden"
          >
            <header className="px-5 py-4 border-b border-tbb-line bg-tbb-cream-50 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Target className="w-4 h-4 text-tbb-orange" aria-hidden />
                <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-orange-700">
                  Goal
                </p>
                <StatusPill status={g.status} />
              </div>
              <h2 className="font-bold text-tbb-navy text-lg leading-tight">
                {g.title}
              </h2>
              {g.description && (
                <p className="text-sm text-tbb-ink-2">{g.description}</p>
              )}
              <p className="text-xs text-tbb-ink-3">
                {g.targetMetric && (
                  <>
                    Target: <strong>{g.targetValue ?? "—"}</strong> {g.targetMetric}
                    {" · "}
                  </>
                )}
                {g.targetDate
                  ? `by ${new Date(g.targetDate).toLocaleDateString()}`
                  : "No deadline"}
              </p>
            </header>
            {goalProjects.length === 0 ? (
              <p className="px-5 py-4 text-sm text-tbb-ink-3 italic">
                No projects supporting this goal yet.
              </p>
            ) : (
              <div className="divide-y divide-tbb-line-soft">
                {goalProjects.map((p) => (
                  <ProjectBlock
                    key={p.id}
                    project={p}
                    actions={actionsByProject.get(p.id) ?? []}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Orphan projects (not tied to a goal) */}
      {orphanProjects.length > 0 && (
        <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
          <header className="px-5 py-3 border-b border-tbb-line bg-tbb-cream-50">
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Projects not tied to a goal
            </p>
            <p className="text-xs text-tbb-ink-3">
              Useful work, but consider rolling these up under a goal so
              you can measure their impact.
            </p>
          </header>
          <div className="divide-y divide-tbb-line-soft">
            {orphanProjects.map((p) => (
              <ProjectBlock
                key={p.id}
                project={p}
                actions={actionsByProject.get(p.id) ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {/* Orphan action items (no project) */}
      {orphanActions.length > 0 && (
        <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
          <header className="px-5 py-3 border-b border-tbb-line bg-tbb-cream-50">
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              One-off action items
            </p>
            <p className="text-xs text-tbb-ink-3">
              Standalone commitments that aren&apos;t part of a project.
            </p>
          </header>
          <ul className="divide-y divide-tbb-line-soft">
            {orphanActions.map((a) => (
              <ActionRow key={a.id} action={a} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function ProjectBlock({
  project,
  actions,
}: {
  project: typeof projects.$inferSelect;
  actions: (typeof actionItems.$inferSelect)[];
}) {
  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <Workflow className="w-4 h-4 text-tbb-blue mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
              Project
            </p>
            <StatusPill status={project.status} />
          </div>
          <h3 className="font-bold text-tbb-navy">{project.name}</h3>
          {project.description && (
            <p className="text-xs text-tbb-ink-3 mt-0.5">
              {project.description}
            </p>
          )}
          {project.targetDate && (
            <p className="text-xs text-tbb-ink-3 mt-1">
              Target:{" "}
              {new Date(project.targetDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      {actions.length === 0 ? (
        <p className="text-xs text-tbb-ink-3 italic pl-6">
          No action items in this project yet.
        </p>
      ) : (
        <ul className="space-y-1.5 pl-6">
          {actions.map((a) => (
            <ActionRow key={a.id} action={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionRow({
  action,
}: {
  action: typeof actionItems.$inferSelect;
}) {
  const done = action.status === "done";
  return (
    <li className="py-2 flex items-start gap-2.5">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-tbb-success shrink-0 mt-0.5" aria-hidden />
      ) : (
        <Circle className="w-4 h-4 text-tbb-ink-3 shrink-0 mt-0.5" aria-hidden />
      )}
      <span className="flex-1 min-w-0">
        <Link
          href={`/coach/action-items/${action.id}`}
          className={
            "text-sm hover:underline " +
            (done ? "line-through text-tbb-ink-3" : "text-tbb-navy")
          }
        >
          {action.title}
        </Link>
        {action.dueDate && (
          <span className="block text-[11px] text-tbb-ink-3">
            Due {new Date(action.dueDate).toLocaleDateString()}
          </span>
        )}
      </span>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-tbb-cream-50 text-tbb-ink-2 border-tbb-line",
    in_progress: "bg-tbb-blue-50 text-tbb-blue border-tbb-blue/30",
    planning: "bg-tbb-cream-50 text-tbb-ink-2 border-tbb-line",
    active: "bg-tbb-blue-50 text-tbb-blue border-tbb-blue/30",
    done: "bg-white text-tbb-success border-tbb-success/30",
    on_hold: "bg-tbb-cream-50 text-tbb-orange-700 border-tbb-cream-200",
    cancelled: "bg-tbb-cream-50 text-tbb-ink-3 border-tbb-line",
    closed: "bg-white text-tbb-success border-tbb-success/30",
  };
  const cls = map[status] ?? map.open;
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-tbb-caps px-1.5 py-0.5 rounded-pill border " +
        cls
      }
    >
      <Flag className="w-2.5 h-2.5" aria-hidden />
      {status.replace(/_/g, " ")}
    </span>
  );
}
