/**
 * /business-builder/engagements/[id]/gantt — visual timeline of every
 * project on the engagement, with action items + deliverables overlaid
 * as live markers.
 *
 * Phase additions in this rev:
 *   • Deliverables render as a dedicated "Milestones" row at the top
 *     of the chart — diamond markers at each deliverable's target /
 *     delivered date. Click a diamond to open the deliverable's
 *     portal page.
 *   • Action item dots are now real <Link>s to their detail page.
 *   • Project bars are <Link>s to the project detail (was the name
 *     only). Plus an inline "Resize timeline" popover beside each
 *     project that updates start + target dates in-place.
 *
 * Pure HTML/CSS chart — no chart library, no drag-resize. The
 * popover-driven date edit gives the same outcome (move/resize) with
 * full keyboard + touch accessibility and no drag-state state-machine.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Diamond,
  Workflow,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  actionItems,
  deliverables,
  engagements,
  projects,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { InlineProjectDateEdit } from "@/components/projects/InlineProjectDateEdit";
import { InteractiveGantt } from "@/components/projects/InteractiveGantt";

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
    const [projectRows, actionRows, deliverableRows] = await Promise.all([
      tx
        .select()
        .from(projects)
        .where(eq(projects.engagementId, id))
        .orderBy(asc(projects.startDate), asc(projects.createdAt)),
      tx
        .select()
        .from(actionItems)
        .where(eq(actionItems.engagementId, id)),
      tx
        .select({
          id: deliverables.id,
          title: deliverables.title,
          type: deliverables.type,
          status: deliverables.status,
          targetDate: deliverables.targetDate,
          deliveredAt: deliverables.deliveredAt,
        })
        .from(deliverables)
        .where(eq(deliverables.engagementId, id)),
    ]);
    return {
      eng,
      projects: projectRows,
      actions: actionRows,
      deliverables: deliverableRows,
    };
  });

  if (!data) notFound();

  // Compute the visible date range. Pull in every date we'll plot
  // (projects, action items, deliverables) so nothing falls off the
  // edge of the chart silently.
  const now = startOfDay(new Date());
  const allDates: Date[] = [];
  for (const p of data.projects) {
    if (p.startDate) allDates.push(startOfDay(new Date(p.startDate)));
    if (p.targetDate) allDates.push(startOfDay(new Date(p.targetDate)));
  }
  for (const a of data.actions) {
    if (a.dueDate) allDates.push(startOfDay(new Date(a.dueDate)));
  }
  for (const d of data.deliverables) {
    const date = d.deliveredAt ?? d.targetDate;
    if (date) allDates.push(startOfDay(new Date(date)));
  }
  const minDate =
    allDates.length > 0
      ? new Date(Math.min(now.getTime() - 7 * dayMs(), ...allDates.map((d) => d.getTime())))
      : new Date(now.getTime() - 7 * dayMs());
  const maxDate =
    allDates.length > 0
      ? new Date(Math.max(now.getTime() + 90 * dayMs(), ...allDates.map((d) => d.getTime())))
      : new Date(now.getTime() + 90 * dayMs());
  const totalDays = Math.min(365, Math.max(30, diffDays(minDate, maxDate) + 7));
  const effectiveMax = new Date(minDate.getTime() + totalDays * dayMs());

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

  const actionsByProject = new Map<string, typeof data.actions>();
  for (const a of data.actions) {
    if (!a.projectId) continue;
    if (!actionsByProject.has(a.projectId)) actionsByProject.set(a.projectId, []);
    actionsByProject.get(a.projectId)!.push(a);
  }

  // Deliverables to plot: anything with a deliveredAt OR a targetDate.
  const milestoneDeliverables = data.deliverables.filter(
    (d) => d.deliveredAt || d.targetDate,
  );

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
        <p className="text-sm text-tbb-ink-3 max-w-3xl">
          Bars = project duration (start → target). Diamonds = deliverable
          milestones (delivered date if shipped, otherwise target). Dots = action
          items, plotted at their due date. Vertical orange line = today.
          Click any marker to open the underlying record. Hit
          <span className="font-bold"> Edit dates</span> on a project to resize
          its bar in-place.
        </p>
      </header>

      {data.projects.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Reschedule projects (drag)
          </h2>
          <InteractiveGantt
            projects={data.projects.map((p) => ({
              id: p.id,
              name: p.name,
              status: p.status,
              startISO: p.startDate ? new Date(p.startDate).toISOString() : null,
              targetISO: p.targetDate
                ? new Date(p.targetDate).toISOString()
                : null,
            }))}
            rangeStartISO={minDate.toISOString()}
            totalDays={totalDays}
          />
        </section>
      )}

      {data.projects.length === 0 && milestoneDeliverables.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-3">
          <Workflow className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">
            No projects or deliverables to chart yet.
          </p>
          <p className="text-sm text-tbb-ink-3">
            Create a project (with a start + target date) or a deliverable
            (with a target date) and it&apos;ll show up here.
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
            <div className="absolute inset-y-0 left-[220px] right-0">
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 pl-1.5 border-l border-tbb-line-soft flex items-center"
                  style={{ left: `${m.offsetPct}%` }}
                >
                  {m.label}
                </div>
              ))}
              {todayOffsetPct >= 0 && todayOffsetPct <= 100 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-tbb-orange"
                  style={{ left: `${todayOffsetPct}%` }}
                  title="Today"
                />
              )}
            </div>
          </div>

          {/* Milestones row — deliverables across the top */}
          {milestoneDeliverables.length > 0 && (
            <div className="grid grid-cols-[220px_1fr] min-h-[52px] border-b border-tbb-line-soft bg-tbb-cream-50/60">
              <div className="px-3 py-2.5 border-r border-tbb-line-soft flex items-center gap-1.5">
                <Diamond className="w-3.5 h-3.5 text-tbb-blue" aria-hidden />
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                  Deliverables
                </span>
                <span className="text-[10px] text-tbb-ink-3 ml-auto">
                  {milestoneDeliverables.length}
                </span>
              </div>
              <div className="relative px-2">
                {todayOffsetPct >= 0 && todayOffsetPct <= 100 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-tbb-orange/70"
                    style={{ left: `${todayOffsetPct}%` }}
                  />
                )}
                {milestoneDeliverables.map((d) => {
                  const date = startOfDay(
                    new Date(d.deliveredAt ?? d.targetDate!),
                  );
                  const offsetPct =
                    (diffDays(minDate, date) / totalDays) * 100;
                  if (offsetPct < 0 || offsetPct > 100) return null;
                  const delivered = Boolean(d.deliveredAt);
                  return (
                    <Link
                      key={d.id}
                      href={`/portal/deliverables`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                      style={{ left: `${offsetPct}%` }}
                      title={`${d.title} — ${d.type.replace(/_/g, " ")} — ${
                        delivered
                          ? "delivered " + date.toLocaleDateString()
                          : "target " + date.toLocaleDateString()
                      }`}
                    >
                      <span
                        className={
                          "block w-3.5 h-3.5 rotate-45 border-2 transition-transform group-hover:scale-125 " +
                          (delivered
                            ? "bg-tbb-success border-tbb-success"
                            : "bg-white border-tbb-blue")
                        }
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* One row per project */}
          <ul className="divide-y divide-tbb-line-soft">
            {data.projects.map((p) => {
              const start = p.startDate ? startOfDay(new Date(p.startDate)) : null;
              const end = p.targetDate ? startOfDay(new Date(p.targetDate)) : null;
              const acts = actionsByProject.get(p.id) ?? [];
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
                  <div className="grid grid-cols-[220px_1fr] min-h-[64px]">
                    {/* Left rail: project name + status + inline date editor */}
                    <div className="px-3 py-2.5 border-r border-tbb-line-soft bg-tbb-cream-50/30 space-y-1">
                      <Link
                        href={`/business-builder/projects/${p.id}`}
                        className="block font-bold text-sm text-tbb-navy hover:underline truncate"
                      >
                        {p.name}
                      </Link>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                          {p.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-tbb-ink-3">
                          · {acts.length} action{acts.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <InlineProjectDateEdit
                        projectId={p.id}
                        initialStart={start}
                        initialTarget={end}
                      />
                    </div>
                    {/* Right rail: timeline lane */}
                    <div className="relative px-2 py-3">
                      {todayOffsetPct >= 0 && todayOffsetPct <= 100 && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-tbb-orange/70 z-10"
                          style={{ left: `${todayOffsetPct}%` }}
                        />
                      )}
                      {/* Project bar — now a Link */}
                      {leftPct !== null && widthPct !== null && (
                        <Link
                          href={`/business-builder/projects/${p.id}`}
                          className={
                            "absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 text-[10px] font-bold text-white overflow-hidden hover:opacity-90 transition-opacity " +
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
                          title={`${p.name} — ${start?.toLocaleDateString()} → ${end?.toLocaleDateString()}`}
                        >
                          <span className="truncate">{p.name}</span>
                        </Link>
                      )}
                      {leftPct !== null && widthPct === null && (
                        <Link
                          href={`/business-builder/projects/${p.id}`}
                          className="absolute top-1/2 -translate-y-1/2 h-6 w-2 rounded bg-tbb-navy hover:opacity-90"
                          style={{ left: `${leftPct}%` }}
                          title={`${p.name} — start ${start?.toLocaleDateString()}`}
                        />
                      )}
                      {/* Action item dots — now Links */}
                      {acts.map((a) => {
                        if (!a.dueDate) return null;
                        const due = startOfDay(new Date(a.dueDate));
                        const dueOffsetPct =
                          (diffDays(minDate, due) / totalDays) * 100;
                        if (dueOffsetPct < 0 || dueOffsetPct > 100) return null;
                        const done = a.status === "done";
                        return (
                          <Link
                            key={a.id}
                            href={`/business-builder/action-items/${a.id}`}
                            className="absolute top-1 -translate-x-1/2 hover:scale-125 transition-transform"
                            style={{ left: `${dueOffsetPct}%` }}
                            title={`${a.title} — due ${due.toLocaleDateString()}${done ? " (done)" : ""}`}
                          >
                            {done ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-tbb-success" aria-hidden />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-tbb-blue" aria-hidden />
                            )}
                          </Link>
                        );
                      })}
                      {leftPct === null && (
                        <p className="text-[11px] text-tbb-ink-3 italic">
                          Set a start + target date to chart this project — use
                          &quot;Edit dates&quot; on the left.
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

      <div className="text-[11px] text-tbb-ink-3 space-y-1">
        <p>
          <span className="inline-block w-3 h-3 rotate-45 border-2 border-tbb-blue bg-white align-middle mr-1" />
          Deliverable target
          <span className="ml-3 inline-block w-3 h-3 rotate-45 border-2 border-tbb-success bg-tbb-success align-middle mr-1" />
          Deliverable shipped
          <span className="mx-3">·</span>
          ● open action item
          <span className="mx-3">·</span>
          ✓ done action item
          <span className="mx-3">·</span>
          vertical orange line = today
        </p>
        <p>
          Every marker is clickable. Hit <span className="font-bold">Edit dates</span> on
          any project to nudge its bar without leaving this page.
        </p>
      </div>
    </main>
  );
}
