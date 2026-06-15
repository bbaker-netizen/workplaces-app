/**
 * Coach-side project detail — the full project-management view.
 *
 * The cross-client list links here (not into the client portal, which
 * bounces coaches). Same management surface the client sees: tasks +
 * sub-tasks, edit/delete, and a jump to the interactive Gantt.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listEngagementGoals } from "@/lib/db/queries/goals";
import { getProjectWithTasks } from "@/lib/db/queries/projects";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { TaskList } from "@/components/projects/TaskList";

export default async function CoachProjectDetailPage({
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

  const project = await getProjectWithTasks(id);
  if (!project) notFound();

  const [members, goals] = await Promise.all([
    listEngagementMembers(project.engagementId),
    listEngagementGoals(project.engagementId),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-2">
        <Link
          href="/business-builder/projects"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> All projects
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
            {project.name}
          </h1>
          <Link
            href={`/business-builder/engagements/${project.engagementId}/gantt`}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" aria-hidden /> Gantt
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          <span>
            Status: <span className="text-foreground">{project.status}</span>
          </span>
          {project.leadName && <span>Lead: {project.leadName}</span>}
          {project.targetDate && (
            <span>Target {project.targetDate.toLocaleDateString()}</span>
          )}
        </div>
      </header>

      <TaskList
        projectId={project.id}
        tasks={project.tasks.map((t) => ({
          id: t.id,
          parentTaskId: t.parentTaskId,
          title: t.title,
          description: t.description,
          status: t.status,
          assigneeUserProfileId: t.assigneeUserProfileId,
          assigneeName: t.assigneeName,
          dueDate: t.dueDate,
          percentComplete: Number(t.percentComplete),
        }))}
        members={members.map((m) => ({ id: m.id, fullName: m.fullName }))}
        canEdit
      />

      <section className="space-y-3">
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          Project details
        </h2>
        <ProjectForm
          engagementId={project.engagementId}
          initial={{
            id: project.id,
            name: project.name,
            description: project.description ?? "",
            status: project.status,
            leadUserProfileId: project.leadUserProfileId,
            startDate: project.startDate
              ? project.startDate.toISOString().slice(0, 10)
              : "",
            targetDate: project.targetDate
              ? project.targetDate.toISOString().slice(0, 10)
              : "",
            revenueImpact: project.revenueImpact,
            marginImpact: project.marginImpact,
            goalId: project.goalId,
          }}
          members={members.map((m) => ({ id: m.id, fullName: m.fullName }))}
          goals={goals.map((g) => ({ id: g.id, title: g.title }))}
          redirectTo="/business-builder/projects"
          showDelete
        />
      </section>
    </main>
  );
}
