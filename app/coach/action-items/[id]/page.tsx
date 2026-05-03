import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getActionItem } from "@/lib/db/queries/action-items";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ActionItemForm } from "@/components/action-items/ActionItemForm";
import {
  STATUSES_VISIBLE_TO_COACH,
  dateToInputValue,
  type ActionItemStatus,
} from "@/components/action-items/utils";

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

  const members = await listEngagementMembers(item.engagementId);
  const formMembers = members.map((m) => ({
    id: m.id,
    fullName: m.fullName,
  }));

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Coach Console — edit action item
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl tracking-tight leading-tight break-words">
          {item.title}
        </h1>
      </header>

      <ActionItemForm
        mode="edit"
        itemId={item.id}
        engagementId={item.engagementId}
        members={formMembers}
        statusOptions={STATUSES_VISIBLE_TO_COACH}
        initialValues={{
          title: item.title,
          description: item.description ?? "",
          status: item.status as ActionItemStatus,
          assigneeUserProfileId: item.assigneeUserProfileId,
          dueDate: dateToInputValue(item.dueDate),
          revenueImpact: item.revenueImpact,
          marginImpact: item.marginImpact,
        }}
        cancelHref="/coach/action-items"
        successHref="/coach/action-items"
      />
    </main>
  );
}
