import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getPortalViewer } from "@/lib/portal/viewer";
import { getActionItem } from "@/lib/db/queries/action-items";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementProjects } from "@/lib/db/queries/projects";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ActionItemForm } from "@/components/action-items/ActionItemForm";
import {
  STATUSES_VISIBLE_TO_CLIENT,
  STATUSES_VISIBLE_TO_COACH,
  STATUS_LABEL,
  dateToInputValue,
  formatDueDate,
  type ActionItemStatus,
} from "@/components/action-items/utils";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { MessageThread } from "@/components/communication/MessageThread";
import { THREAD_TYPE } from "@/lib/communication/audience";

export default async function EditPortalActionItemPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  const item = await getActionItem(params.id);
  // Cross-client guard: only show an item that belongs to the engagement
  // this portal is currently bound to.
  if (!item || !engagement || item.engagementId !== engagement.id) notFound();

  const [members, projects] = await Promise.all([
    listEngagementMembers(item.engagementId),
    listEngagementProjects(item.engagementId),
  ]);
  const formMembers = members.map((m) => ({ id: m.id, fullName: m.fullName }));
  const formProjects = projects.map((p) => ({ id: p.id, name: p.name }));

  const viewer = await getPortalViewer(profile, item.engagementId);
  const isCoachLike =
    viewer.role === "master_admin" || viewer.role === "coach";
  const statusOptions: readonly ActionItemStatus[] = isCoachLike
    ? STATUSES_VISIBLE_TO_COACH
    : STATUSES_VISIBLE_TO_CLIENT;

  // A draft is a proposal a Business Builder hasn't published. It must
  // not be reachable by URL either — the list filter alone would leave
  // one open to anybody who guessed or kept a link.
  if (!isCoachLike && item.status === "draft") notFound();

  // What this client may actually change here. The assignee owns the
  // status and the date; everything else is the Business Builder's.
  // Mirrors the restricted-field list in updateActionItem, which is the
  // authority — this only decides what the form offers.
  const isAssignee =
    viewer.userProfileId !== null &&
    item.assigneeUserProfileId === viewer.userProfileId;
  const canEditSchedule = isCoachLike || isAssignee;

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {canEditSchedule ? "Edit action item" : "Action item"}
        </p>
        <h1 className="font-bold text-foreground text-3xl tracking-tight leading-tight break-words">
          {item.title}
        </h1>
      </header>

      {canEditSchedule ? (
        <ActionItemForm
          mode="edit"
          itemId={item.id}
          engagementId={item.engagementId}
          members={formMembers}
          projects={formProjects}
          statusOptions={statusOptions}
          initialValues={{
            title: item.title,
            description: item.description ?? "",
            status: item.status as ActionItemStatus,
            assigneeUserProfileId: item.assigneeUserProfileId,
            dueDate: dateToInputValue(item.dueDate),
            revenueImpact: item.revenueImpact,
            marginImpact: item.marginImpact,
            projectId: item.projectId,
          }}
          cancelHref="/portal/action-items"
          successHref="/portal/action-items"
          scope={isCoachLike ? "full" : "assignee"}
        />
      ) : (
        // Somebody else's commitment. The form is not rendered at all
        // rather than rendered-and-rejected: `updateActionItem` refuses
        // a non-assignee outright, so a Save button here could only ever
        // produce "you can only update items assigned to you".
        <section className="space-y-3">
          <div className="rounded-md border border-tbb-line bg-white px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
              <span className="text-foreground font-bold">
                {STATUS_LABEL[item.status as ActionItemStatus]}
              </span>
              <span aria-hidden className="text-tbb-line">·</span>
              <span className="text-foreground">
                {item.assigneeName ?? "Unassigned"}
              </span>
              <span aria-hidden className="text-tbb-line">·</span>
              <span className="text-foreground">
                {formatDueDate(item.dueDate)}
              </span>
            </div>
            {item.description && <MarkdownBody body={item.description} />}
          </div>
          <p className="font-sans text-sm text-muted-foreground border-l-2 border-tbb-line pl-3">
            This one is assigned to someone else on your team, so it is
            theirs to update. You can still weigh in below.
          </p>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          {isCoachLike ? "Discussion" : "Talk to your Business Builder"}
        </h2>
        <p className="font-sans text-sm text-muted-foreground -mt-2">
          {isCoachLike
            ? "Anyone on this engagement can see and reply here."
            : "Stuck, need more time, or want to hand this back? Say so here — your Business Builder is notified and it stays attached to this item."}
        </p>
        <MessageThread
          engagementId={item.engagementId}
          threadType={THREAD_TYPE.actionItem}
          parentEntityId={item.id}
          composerPlaceholder={
            isCoachLike
              ? "Comment on this action item…"
              : "Ask a question, flag a blocker, or give an update…"
          }
          emptyState="No comments yet. Use this space to discuss progress, blockers, or context."
        />
      </section>
    </main>
  );
}
