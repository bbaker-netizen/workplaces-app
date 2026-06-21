import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementGoals } from "@/lib/db/queries/goals";
import { getProjectWithTasks } from "@/lib/db/queries/projects";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { TaskList } from "@/components/projects/TaskList";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

export default async function PortalProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const project = await getProjectWithTasks(params.id);
  // Cross-client guard: only show a project that belongs to the engagement
  // this portal is currently bound to. Without this, opening a project id
  // from a different client would render it under this client's portal.
  if (!project || project.engagementId !== engagement.id) notFound();

  const canEdit =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";
  const [members, goals] = canEdit
    ? await Promise.all([
        listEngagementMembers(engagement.id),
        listEngagementGoals(engagement.id),
      ])
    : [[] as Awaited<ReturnType<typeof listEngagementMembers>>, [] as Awaited<ReturnType<typeof listEngagementGoals>>];

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      <header className="space-y-2">
        <Link
          href="/portal/projects"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← All projects
        </Link>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {project.name}
        </h1>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          <span>Status: <span className="text-foreground">{project.status}</span></span>
          {project.leadName && <span>Lead: {project.leadName}</span>}
          {project.targetDate && (
            <span>
              Target {project.targetDate.toLocaleDateString()}
            </span>
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
        canEdit={canEdit}
      />

      {canEdit ? (
        <section className="space-y-3">
          <h2 className="font-bold text-foreground text-xl tracking-tight">
            Project details
          </h2>
          <ProjectForm
            engagementId={engagement.id}
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
            members={members.map((m) => ({
              id: m.id,
              fullName: m.fullName,
            }))}
            goals={goals.map((g) => ({ id: g.id, title: g.title }))}
            redirectTo="/portal/projects"
            showDelete
          />
        </section>
      ) : (
        project.description && (
          <section className="space-y-3">
            <h2 className="font-bold text-foreground text-xl tracking-tight">
              About this project
            </h2>
            <div className="border border-tbb-line rounded-md bg-white p-4">
              <MarkdownBody body={project.description} />
            </div>
          </section>
        )
      )}
    </main>
  );
}
