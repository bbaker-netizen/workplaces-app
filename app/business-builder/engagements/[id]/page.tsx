/**
 * /business-builder/engagements/[id] — engagement detail with the Workspace
 * view as its main content. Shows the proper three-tier hierarchy
 * the Coach + client both need:
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
 * stays on the existing module pages (/business-builder/goals,
 * /business-builder/projects, /business-builder/action-items) — the Workspace is the
 * single overview the Coach + client land on.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Diamond,
  Eye,
  FileText,
  Flag,
  FolderOpen,
  LayoutGrid,
  ListTree,
  MessageSquare,
  Video,
  Workflow,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listProspectActivities } from "@/lib/db/queries/prospects";
import { activityTypeLabel } from "@/lib/pipeline/stages";
import {
  actionItems,
  deliverables,
  embeddedApps,
  engagements,
  goals,
  orgs,
  portalModuleAssignments,
  projects,
  prospects,
  resources,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ALL_MODULES } from "@/lib/modules";
import { QuickAddDeliverableButton } from "@/components/deliverables/QuickAddDeliverableButton";
import {
  PortalModuleManager,
  type ModuleState,
} from "@/components/business-builder/PortalModuleManager";
import {
  EmbeddedAppManager,
  type EngagementApp,
  type NetlifyProjectOption,
} from "@/components/business-builder/EmbeddedAppManager";
import { InviteClientButton } from "@/components/business-builder/InviteClientButton";
import { EngagementStatusControl } from "@/components/business-builder/EngagementStatusControl";
import { EngagementProgramControl } from "@/components/business-builder/EngagementProgramControl";
import { EngagementArchiveButton } from "@/components/business-builder/EngagementArchiveButton";
import { DeleteEngagementButton } from "@/components/business-builder/DeleteEngagementButton";
import { EngagementRename } from "@/components/business-builder/EngagementRename";
import { BulkAddProjects } from "@/components/projects/BulkAddProjects";

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

    const [
      goalRows,
      projectRows,
      actionRows,
      deliverableRows,
      moduleRows,
      appRows,
      netlifyRows,
      orgRow,
      prospectRow,
    ] = await Promise.all([
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
        tx
          .select({
            id: deliverables.id,
            type: deliverables.type,
            title: deliverables.title,
            status: deliverables.status,
            targetDate: deliverables.targetDate,
            deliveredAt: deliverables.deliveredAt,
          })
          .from(deliverables)
          .where(eq(deliverables.engagementId, id))
          .orderBy(asc(deliverables.targetDate), asc(deliverables.createdAt)),
        tx
          .select({
            module: portalModuleAssignments.module,
            isEnabled: portalModuleAssignments.isEnabled,
          })
          .from(portalModuleAssignments)
          .where(eq(portalModuleAssignments.engagementId, id)),
        tx
          .select({
            id: embeddedApps.id,
            displayName: embeddedApps.displayName,
            appUrl: embeddedApps.appUrl,
            authMode: embeddedApps.authMode,
          })
          .from(embeddedApps)
          .where(eq(embeddedApps.engagementId, id)),
        tx
          .select({
            sourceId: resources.sourceId,
            title: resources.title,
            url: resources.url,
          })
          .from(resources)
          .where(
            and(
              eq(resources.orgId, profile.orgId),
              eq(resources.source, "netlify"),
            ),
          ),
        tx
          .select({ clerkOrgId: orgs.clerkOrgId })
          .from(orgs)
          .where(eq(orgs.id, eng.orgId))
          .limit(1),
        tx
          .select({
            id: prospects.id,
            companyName: prospects.companyName,
            contactEmail: prospects.contactEmail,
          })
          .from(prospects)
          .where(eq(prospects.convertedEngagementId, id))
          .limit(1),
      ]);
    return {
      eng,
      goals: goalRows,
      projects: projectRows,
      actions: actionRows,
      deliverables: deliverableRows,
      moduleAssignments: moduleRows,
      apps: appRows,
      netlifyResources: netlifyRows,
      clerkOrgId: orgRow[0]?.clerkOrgId ?? null,
      clientEmail: prospectRow[0]?.contactEmail ?? null,
      prospectId: prospectRow[0]?.id ?? null,
      prospectCompany: prospectRow[0]?.companyName ?? null,
    };
  });

  if (!data) notFound();

  // Pull the originating prospect's activity log so the pre-engagement
  // history (calls, emails, meetings, diagnostic, stage changes) lives
  // alongside the engagement instead of stranded back in the pipeline.
  const pipelineActivities = data.prospectId
    ? (await listProspectActivities(data.prospectId)).slice(0, 8)
    : [];

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

  // projectsByGoal kept for back-compat with the schema; goals layer
  // is no longer surfaced in the UI per Bruce. orphanActions = action
  // items not tied to any project.
  void projectsByGoal;
  const orphanActions = actionsByProject.get("unassigned") ?? [];

  // Client-portal module states: each module is ON by default; an
  // assignment row is what turns one off. Drives the manager below.
  const moduleEnabled = new Map<string, boolean>();
  for (const a of data.moduleAssignments) {
    moduleEnabled.set(a.module, a.isEnabled);
  }
  const moduleStates: ModuleState[] = ALL_MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    enabled: moduleEnabled.get(m.key) ?? true,
  }));

  const apps: EngagementApp[] = data.apps.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    appUrl: a.appUrl,
    authMode: a.authMode,
  }));
  const netlifyProjects: NetlifyProjectOption[] = data.netlifyResources
    .filter((r) => r.sourceId && r.url)
    .map((r) => ({ id: r.sourceId!, name: r.title, url: r.url! }));

  // The client has a real Clerk org (been invited) unless the placeholder
  // is still in place. Null org is treated as "already invited" (hide).
  const clientInvited = data.clerkOrgId
    ? !data.clerkOrgId.startsWith("pending:")
    : true;

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/business-builder/engagements"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Engagements
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <EngagementRename
            engagementId={id}
            name={data.eng.name ?? "Engagement"}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href={`/portal/e/${id}`}
              prefetch={false}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors"
              title="See this client's portal exactly as they do"
            >
              <Eye className="w-3.5 h-3.5" aria-hidden /> Preview portal
            </Link>
            <Link
              href={`/business-builder/documents/${id}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
              title="Documents + Google Drive folder for this client"
            >
              <FolderOpen className="w-3.5 h-3.5" aria-hidden /> Documents &amp; Drive
            </Link>
            <Link
              href={`/business-builder/engagements/${id}/meetings`}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
              title="Fireflies meeting notes — sync the latest"
            >
              <Video className="w-3.5 h-3.5" aria-hidden /> Meetings &amp; sync
            </Link>
            <EngagementProgramControl
              engagementId={id}
              current={data.eng.type}
            />
            <EngagementStatusControl
              engagementId={id}
              current={data.eng.status}
            />
            <EngagementArchiveButton
              engagementId={id}
              engagementName={data.eng.name ?? "this client"}
              archived={Boolean(data.eng.archivedAt)}
              variant="full"
            />
            {data.eng.archivedAt && (
              <DeleteEngagementButton
                engagementId={id}
                engagementName={data.eng.name ?? "this client"}
                redirectTo="/business-builder/engagements"
              />
            )}
          </div>
        </div>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          The Workspace: every project and action item for this client,
          nested the way they relate to each other. Projects at the top,
          the specific commitments under each one.
        </p>
        <div className="flex items-center gap-3 flex-wrap text-xs">
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
          <span className="inline-flex items-center gap-1.5 text-tbb-ink-3">
            <Diamond className="w-3.5 h-3.5" aria-hidden />
            {data.deliverables.length} deliverable
            {data.deliverables.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {/* Client portal manager — which modules this client sees. */}
      <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
        <header className="px-5 py-3 border-b border-tbb-line bg-tbb-cream-50 flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-tbb-blue" aria-hidden />
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Client portal — what this client sees
          </p>
        </header>
        <div className="p-5 space-y-4">
          <div className="border border-tbb-line-soft rounded-md bg-tbb-cream-50 p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Client access
            </p>
            <p className="text-xs text-tbb-ink-3 max-w-2xl">
              {clientInvited
                ? "This client has been invited and can log into their portal."
                : "Prepare the portal below, then invite the client when you're ready — this creates their login and emails them."}
            </p>
            <InviteClientButton
              engagementId={id}
              invited={clientInvited}
              clientEmail={data.clientEmail}
            />
          </div>
          <p className="text-xs text-tbb-ink-3 max-w-2xl">
            Toggle which modules appear in this client&apos;s portal. Everything
            is on by default; turn off anything they don&apos;t need.
          </p>
          <PortalModuleManager engagementId={id} modules={moduleStates} />

          <div className="border-t border-tbb-line-soft pt-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Apps in this client&apos;s portal
            </p>
            <p className="text-xs text-tbb-ink-3 max-w-2xl">
              Surface one of your Netlify projects as an embedded widget in
              this client&apos;s portal. Sync projects first under{" "}
              <Link
                href="/business-builder/library"
                className="text-tbb-blue underline underline-offset-2"
              >
                Tools &amp; tutorials
              </Link>
              .
            </p>
            <EmbeddedAppManager
              engagementId={id}
              apps={apps}
              netlifyProjects={netlifyProjects}
            />
          </div>
        </div>
      </section>

      {data.projects.length === 0 && data.actions.length === 0 && (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-2">
          <Workflow className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">No work captured yet.</p>
          <p className="text-sm text-tbb-ink-3 max-w-md mx-auto">
            Start with one project — a body of work that ships
            something — then capture the action items inside it as you
            go through sessions.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Link
              href={`/business-builder/projects/new?engagement=${id}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
            >
              <Workflow className="w-3.5 h-3.5" aria-hidden /> Add first project
            </Link>
          </div>
        </div>
      )}

      {/* All projects + their action items — Goals layer removed
          per Bruce. Projects roll up directly to the engagement. */}
      {data.projects.length > 0 && (
        <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
          <header className="px-5 py-3 border-b border-tbb-line bg-tbb-cream-50 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Projects
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href={`/business-builder/engagements/${id}/gantt`}
                className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
              >
                Gantt chart →
              </Link>
              <BulkAddProjects engagementId={id} />
              <Link
                href={`/business-builder/projects/new?engagement=${id}`}
                className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
              >
                + Add project
              </Link>
            </div>
          </header>
          <div className="divide-y divide-tbb-line-soft">
            {data.projects.map((p) => (
              <ProjectBlock
                key={p.id}
                project={p}
                actions={actionsByProject.get(p.id) ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {/* Deliverables — methodology-typed work products. */}
      <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
        <header className="px-5 py-3 border-b border-tbb-line bg-tbb-cream-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-tbb-blue" aria-hidden />
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Deliverables
            </p>
            <span className="text-[10px] text-tbb-ink-3">
              {data.deliverables.length}
            </span>
          </div>
          <QuickAddDeliverableButton engagementId={id} />
        </header>
        {data.deliverables.length === 0 ? (
          <p className="text-xs text-tbb-ink-3 italic px-5 py-4">
            No deliverables yet. Click <span className="font-bold">+ Add deliverable</span> above
            to queue one — pick the methodology type (SOP, org chart, business plan, etc.) and
            give it a title.
          </p>
        ) : (
          <ul className="divide-y divide-tbb-line-soft">
            {data.deliverables.map((d) => (
              <li key={d.id} className="px-5 py-3 flex items-baseline justify-between gap-3 flex-wrap">
                <span className="flex items-baseline gap-2">
                  <Diamond
                    className={
                      "w-3 h-3 mt-0.5 " +
                      (d.deliveredAt ? "text-tbb-success" : "text-tbb-blue")
                    }
                    aria-hidden
                  />
                  <Link
                    href="/portal/deliverables"
                    className="font-bold text-tbb-navy hover:underline"
                  >
                    {d.title}
                  </Link>
                  <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                    {d.type.replace(/_/g, " ")}
                  </span>
                </span>
                <span className="flex items-baseline gap-3">
                  {d.targetDate && !d.deliveredAt && (
                    <span className="text-[11px] text-tbb-ink-3">
                      Target {new Date(d.targetDate).toLocaleDateString()}
                    </span>
                  )}
                  {d.deliveredAt && (
                    <span className="text-[11px] text-tbb-success font-bold">
                      Delivered {new Date(d.deliveredAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 bg-tbb-cream-50 px-1.5 py-0.5 rounded-pill">
                    {d.status.replace(/_/g, " ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pipeline history — the originating prospect's comms + activity. */}
      {data.prospectId && (
        <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
          <header className="px-5 py-3 border-b border-tbb-line bg-tbb-cream-50 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-tbb-blue" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
                From the pipeline
              </p>
            </div>
            <Link
              href={`/business-builder/pipeline/${data.prospectId}`}
              className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
            >
              Open prospect →
            </Link>
          </header>
          {pipelineActivities.length === 0 ? (
            <p className="text-xs text-tbb-ink-3 italic px-5 py-4">
              No logged activity from before this became an engagement.
            </p>
          ) : (
            <ul className="divide-y divide-tbb-line-soft">
              {pipelineActivities.map((a) => (
                <li
                  key={a.id}
                  className="px-5 py-3 flex items-baseline justify-between gap-3 flex-wrap"
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue shrink-0">
                      {activityTypeLabel(a.type)}
                    </span>
                    <span className="text-sm text-tbb-ink-2 truncate">
                      {a.subject || a.body || "—"}
                    </span>
                  </span>
                  <span className="text-[11px] text-tbb-ink-3 whitespace-nowrap">
                    {new Date(a.occurredAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
          <ul className="divide-y divide-tbb-line-soft px-5">
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
            <Link
              href={`/business-builder/projects/${project.id}`}
              className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
              title="Open the task grid — add tasks and sub-tasks"
            >
              <ListTree className="w-3.5 h-3.5" aria-hidden /> Manage tasks
            </Link>
          </div>
          <h3 className="font-bold text-tbb-navy">
            <Link
              href={`/business-builder/projects/${project.id}`}
              className="hover:underline"
            >
              {project.name}
            </Link>
          </h3>
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
          href={`/business-builder/action-items/${action.id}`}
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
