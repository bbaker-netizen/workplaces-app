/**
 * /business-builder/engagements/[id]/gantt — visual timeline of every
 * project on the engagement, with action items nested under each.
 *
 * Pure HTML/CSS Gantt — no chart library, no client-side render. Each
 * row is a project; each bar's left/width is computed from start_date
 * and target_date relative to the visible date range. Action items
 * appear as small dots on the project's row at their due_date.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, Workflow, CheckCircle2, Circle } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  actionItems,
  engagements,
  projects,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

function dayMs(): number {
  return 24 * 60 * 60 * 1000;
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / dayMs());
}
function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

export default async function ProjectGanttPage({
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

  const data = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.id, id))
      .limit(1);
    if (!eng) return null;
    const [projectRows, actionRows] = await Promise.all([
      tx
        .select()
        .from(projects)
        .where(eq(projects.engagementId, id))
        .orderBy(asc(projects.startDate), asc(projects.createdAt)),
      tx
        .select()
        .from(actionItems)
        .where(eq(actionItems.engagementId, id)),
    ]);
    return { eng, projects: projectRows, actions: actionRows };
  });

  if (!data) notFound();

  // Compute the visible date range. We start at the earliest project
  // start date (or today, whichever is earlier minus a 7-day buffer)
  // and end at the latest target date (or today + 90 days, whichever
  // is later plus a 7-day buffer). Capped at ~12 months total so the
  // bars stay readable.
  const now = startOfDay(new Date());
  const allDates: Date[] = [];
  for (const p of data.projects) {
    if (p.startDate) allDates.push(startOfDay(new Date(p.startDate)));
    if (p.targetDate) allDates.push(startOfDay(new Date(p.targetDate)));
  }
  for (const a of data.actions) {
    if (a.dueDate) allDates.push(startOfDay(new Date(a.dueDate)));
  }
  const minDate =
    allDates.length > 0
      ? new Date(Math.min(now.getTime() - 7 * dayMs(), ...allDates.map((d) => d.getTime())))
      : new Date(now.getTime() - 7 * dayMs());
  const maxDate =
    allDates.length > 0
      ? new Date(Math.max(now.getTime() + 90 * dayMs(), ...allDates.map((d) => d.getTime())))
      : new Date(now.getTime() + 90 * dayMs());
  // Cap at 365 days so the chart stays readable.
  const totalDays = Math.min(365, Math.max(30, diffDays(minDate, maxDate) + 7));
  const effectiveMax = new Date(minDate.getTime() + totalDays * dayMs());

  // Build month-tick header positions so the chart shows month labels.
  const months: Array<{ label: string; offsetPct: number }> = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor < effectiveMax) {
    const offsetPct = (diffDays(minDate, cursor) / totalDays) * 100;
    if (offsetPct >= 0 && offsetPct <= 100) {
      months.push({
        label: cursor.toLocaleString("en-CA", {
          month: "short",
          year: "2-digit",
        }),
        offsetPct,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const todayOffsetPct =
    ((startOfDay(now).getTime() - minDate.getTime()) / dayMs() / totalDays) *
    100;

  // Action items grouped by project, for the dot overlay.
  const actionsByProject = new Map<string, typeof data.actions>();
  for (const a of data.actions) {
    if (!a.projectId) continue;
    if (!actionsByProject.has(a.projectId)) actionsByProject.set(a.projectId, []);
    actionsByProject.get(a.projectId)!.push(a);
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href={`/business-builder/engagements/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Workspace
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          {data.eng.name ?? "Engagement"} — Gantt
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Every project on the timeline. Bars = project duration
          (start → target). Dots = action items, plotted at their due
          date. Vertical orange line = today.
        </p>
      </header>

      {data.projects.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-3">
          <Workflow className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">
            No projects to chart yet.
          </p>
          <p className="text-sm text-tbb-ink-3">
            Create a project (with a start + target date) and it&apos;ll
            show up here as a bar.
          </p>
          <Link
            href={`/business-builder/projects/new?engagement=${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
          >
            + New project
          </Link>
        </div>
      ) : (
        <div className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
          {/* Month header */}
          <div className="relative h-9 border-b border-tbb-line-soft bg-tbb-bg-soft">
            <div className="absolute inset-y-0 left-[200px] right-0">
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 pl-1.5 border-l border-tbb-line-soft flex items-center"
                  style={{ left: `${m.offsetPct}%` }}
                >
                  {m.label}
                </div>
              ))}
              {/* Today line in the header */}
              {todayOffsetPct >= 0 && todayOffsetPct <= 100 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-tbb-orange"
                  style={{ left: `${todayOffsetPct}%` }}
                  title="Today"
                />
              )}
            </div>
          </div>

          {/* One row per project */}
          <ul className="divide-y divide-tbb-line-soft">
            {data.projects.map((p) => {
              const start = p.startDate ? startOfDay(new Date(p.startDate)) : null;
              const end = p.targetDate ? startOfDay(new Date(p.targetDate)) : null;
              const acts = actionsByProject.get(p.id) ?? [];

              // Compute bar geometry. If only one of start/end is set,
              // we render the bar as a short hatched mark at that date.
              const leftPct = start
                ? Math.max(0, (diffDays(minDate, start) / totalDays) * 100)
                : null;
              const widthPct =
                start && end && end > start
                  ? Math.min(
                      100 - (leftPct ?? 0),
                      (diffDays(start, end) / totalDays) * 100,
                    )
                  : null;

              return (
                <li key={p.id} className="relative">
                  <div className="grid grid-cols-[200px_1fr] min-h-[64px]">
                    {/* Left rail: project name + status */}
                    <div className="px-3 py-2.5 border-r border-tbb-line-soft bg-tbb-cream-50/30">
                      <Link
                        href={`/portal/projects/${p.id}`}
                        className="block font-bold text-sm text-tbb-navy hover:underline truncate"
                      >
                        {p.name}
                      </Link>
                      <span className="block text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mt-0.5">
                        {p.status.replace(/_/g, " ")}
                      </span>
                      <span className="block text-[10px] text-tbb-ink-3 mt-0.5">
                        {acts.length} action{acts.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {/* Right rail: timeline lane */}
                    <div className="relative px-2 py-3">
                      {/* Today line */}
                      {todayOffsetPct >= 0 && todayOffsetPct <= 100 && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-tbb-orange/70 z-10"
                          style={{ left: `${todayOffsetPct}%` }}
                        />
                      )}
                      {/* Project bar */}
                      {leftPct !== null && widthPct !== null && (
                        <div
                          className={
                            "absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 text-[10px] font-bold text-white overflow-hidden " +
                            (p.status === "completed"
                              ? "bg-tbb-success"
                              : p.status === "blocked"
                                ? "bg-tbb-danger"
                                : p.status === "active"
                                  ? "bg-tbb-blue"
                                  : "bg-tbb-navy")
                          }
                          style={{
                            left: `${leftPct}%`,
                            width: `${Math.max(2, widthPct)}%`,
                          }}
                          title={`${start?.toLocaleDateString()} → ${end?.toLocaleDateString()}`}
                        >
                          <span className="truncate">{p.name}</span>
                        </div>
                      )}
                      {leftPct !== null && widthPct === null && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-6 w-2 rounded bg-tbb-navy"
                          style={{ left: `${leftPct}%` }}
                          title={`Start ${start?.toLocaleDateString()}`}
                        />
                      )}
                      {/* Action item dots */}
                      {acts.map((a) => {
                        if (!a.dueDate) return null;
                        const due = startOfDay(new Date(a.dueDate));
                        const dueOffsetPct =
                          (diffDays(minDate, due) / totalDays) * 100;
                        if (dueOffsetPct < 0 || dueOffsetPct > 100) return null;
                        const done = a.status === "done";
                        return (
                          <div
                            key={a.id}
                            className="absolute top-1 -translate-x-1/2"
                            style={{ left: `${dueOffsetPct}%` }}
                            title={`${a.title} — due ${due.toLocaleDateString()}`}
                          >
                            {done ? (
                              <CheckCircle2 className="w-3 h-3 text-tbb-success" aria-hidden />
                            ) : (
                              <Circle className="w-3 h-3 text-tbb-blue" aria-hidden />
                            )}
                          </div>
                        );
                      })}
                      {leftPct === null && (
                        <p className="text-[11px] text-tbb-ink-3 italic">
                          Set a start + target date on this project to chart it.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-tbb-ink-3">
        Legend: ● open action item · ✓ done action item · vertical orange
        line = today. Click a project name to open its detail page.
      </p>
    </main>
  );
}
