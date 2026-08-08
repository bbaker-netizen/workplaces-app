import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getActionItem } from "@/lib/db/queries/action-items";
import { getEngagementByIdOrSlug } from "@/lib/db/queries/engagements";
import { safeReturnTo } from "@/lib/navigation/return-to";
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
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string | string[] };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const item = await getActionItem(params.id);
  if (!item) notFound();

  const [members, projects, engagement] = await Promise.all([
    listEngagementMembers(item.engagementId),
    listEngagementProjects(item.engagementId),
    getEngagementByIdOrSlug(item.engagementId),
  ]);

  /**
   * Where saving, deleting or cancelling puts you.
   *
   * The fallback is the CLIENT this item belongs to, not the console-wide
   * list. An action item is always somebody's — landing on 200 items
   * across 18 clients after editing one of them is how you lose your
   * place, which is exactly what Jen reported. `?from=` overrides it for
   * anyone who genuinely arrived from the cross-client list.
   */
  const returnTo = safeReturnTo(
    searchParams.from,
    `/business-builder/engagements/${item.engagementId}`,
  );
  const formMembers = members.map((m) => ({
    id: m.id,
    fullName: m.fullName,
  }));
  const formProjects = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
      <header className="space-y-2">
        {/* The way back, named. Without this the only route to the client
            whose item this is was the browser's back button — and after a
            save or a delete, not even that. */}
        <Link
          href={`/business-builder/engagements/${item.engagementId}`}
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden />
          {engagement?.name ?? "Back to the client"}
        </Link>
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
        cancelHref={returnTo}
        successHref={returnTo}
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
