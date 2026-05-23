import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getActionItem } from "@/lib/db/queries/action-items";
import { listEngagementProjects } from "@/lib/db/queries/projects";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ActionItemForm } from "@/components/action-items/ActionItemForm";
import {
  STATUSES_VISIBLE_TO_COACH,
  dateToInputValue,
  type ActionItemStatus,
} from "@/components/action-items/utils";
import { MessageThread } from "@/components/communication/MessageThread";
import { THREAD_TYPE } from "@/lib/communication/audience";

export default async function EditCoachActionItemPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const item = await getActionItem(params.id);
  if (!item) notFound();

  const [members, projects] = await Promise.all([
    listEngagementMembers(item.engagementId),
    listEngagementProjects(item.engagementId),
  ]);
  const formMembers = members.map((m) => ({
    id: m.id,
    fullName: m.fullName,
  }));
  const formProjects = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console — edit action item
        </p>
        <h1 className="font-bold text-foreground text-3xl tracking-tight leading-tight break-words">
          {item.title}
        </h1>
      </header>

      <ActionItemForm
        mode="edit"
        itemId={item.id}
        engagementId={item.engagementId}
        members={formMembers}
        projects={formProjects}
        statusOptions={STATUSES_VISIBLE_TO_COACH}
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
        cancelHref="/business-builder/action-items"
        successHref="/business-builder/action-items"
      />

      <section className="space-y-4">
        <h2 className="font-bold text-foreground text-xl tracking-tight">
          Discussion
        </h2>
        <MessageThread
          engagementId={item.engagementId}
          threadType={THREAD_TYPE.actionItem}
          parentEntityId={item.id}
          composerPlaceholder="Comment on this action item…"
          emptyState="No comments yet."
        />
      </section>
    </main>
  );
}
