import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getActionItem } from "@/lib/db/queries/action-items";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ActionItemForm } from "@/components/action-items/ActionItemForm";
import {
  STATUSES_VISIBLE_TO_CLIENT,
  STATUSES_VISIBLE_TO_COACH,
  dateToInputValue,
  type ActionItemStatus,
} from "@/components/action-items/utils";
import { MessageThread } from "@/components/communication/MessageThread";
import { THREAD_TYPE } from "@/lib/communication/audience";

export default async function EditPortalActionItemPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const item = await getActionItem(params.id);
  if (!item) notFound();

  const members = await listEngagementMembers(item.engagementId);
  const formMembers = members.map((m) => ({ id: m.id, fullName: m.fullName }));

  const isCoachLike =
    profile.role === "master_admin" || profile.role === "coach";
  const statusOptions: readonly ActionItemStatus[] = isCoachLike
    ? STATUSES_VISIBLE_TO_COACH
    : STATUSES_VISIBLE_TO_CLIENT;

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Edit action item
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
        statusOptions={statusOptions}
        initialValues={{
          title: item.title,
          description: item.description ?? "",
          status: item.status as ActionItemStatus,
          assigneeUserProfileId: item.assigneeUserProfileId,
          dueDate: dateToInputValue(item.dueDate),
          revenueImpact: item.revenueImpact,
          marginImpact: item.marginImpact,
        }}
        cancelHref="/portal/action-items"
        successHref="/portal/action-items"
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
          emptyState="No comments yet. Use this space to discuss progress, blockers, or context."
        />
      </section>
    </main>
  );
}
