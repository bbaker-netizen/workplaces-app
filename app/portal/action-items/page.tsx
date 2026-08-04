import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getPortalViewer } from "@/lib/portal/viewer";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementActionItems } from "@/lib/db/queries/action-items";
import { sortActionItems } from "@/components/action-items/sort";
import { ActionItemListClient } from "@/components/action-items/ActionItemListClient";
import {
  STATUSES_VISIBLE_TO_CLIENT,
  STATUSES_VISIBLE_TO_COACH,
  type ActionItemStatus,
} from "@/components/action-items/utils";

export default async function PortalActionItemsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-bold text-foreground text-3xl tracking-tight">
          No engagement yet
        </h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Your portal isn&apos;t bound to an engagement. If you expect access,
          contact your Business Builder.
        </p>
      </main>
    );
  }

  // Everything below is a PRESENTATION decision, so it reads the
  // effective viewer, not the signed-in profile. On a Business Builder
  // previewing this client that swaps master_admin for client_lead —
  // without it the preview rendered the coach view (drafts, the Draft
  // chip) under a banner promising "this is what they see".
  const viewer = await getPortalViewer(profile, engagement.id);
  const isCoachLike =
    viewer.role === "master_admin" || viewer.role === "coach";
  const allItems = await listEngagementActionItems(engagement.id);
  const sorted = sortActionItems(allItems);

  // Hide drafts from non-Coach roles. An item a Business Builder has not
  // published is a proposal, not a commitment.
  const visibleItems = isCoachLike
    ? sorted
    : sorted.filter((i) => i.status !== "draft");

  const statusOptions: readonly ActionItemStatus[] = isCoachLike
    ? STATUSES_VISIBLE_TO_COACH
    : STATUSES_VISIBLE_TO_CLIENT;

  // The Business Builder controls action-item creation and assignment, so
  // only master_admin / Coach get the New button. Clients update status on
  // items assigned to them.
  const canCreate = isCoachLike;

  // Full edit (content/assignee) is Business-Builder-only too; clients are
  // limited to status updates on their own items.
  const fullEditor = isCoachLike;

  const items = visibleItems.map((it) => ({
    id: it.id,
    title: it.title,
    description: it.description,
    status: it.status as ActionItemStatus,
    assigneeName: it.assigneeName,
    dueDate: it.dueDate,
    revenueImpact: it.revenueImpact,
    marginImpact: it.marginImpact,
    detailHref: `/portal/action-items/${it.id}`,
    // A client owns the status of their OWN work. The pill used to be
    // disabled for every client role, which left "mark it in progress"
    // — the one thing an assignee does between sessions — reachable
    // only by opening the item. Per item, because a client must not be
    // able to flip somebody else's.
    pillDisabled:
      !fullEditor &&
      !(
        viewer.userProfileId !== null &&
        it.assigneeUserProfileId === viewer.userProfileId
      ),
  }));

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Action items
        </h1>
      </header>

      <ActionItemListClient
        items={items}
        statusOptions={statusOptions}
        newItemHref={canCreate ? "/portal/action-items/new" : null}
        emptyHeadline="Clean slate."
        emptyDescription={
          canCreate
            ? "No action items yet — which is either a blissful Tuesday or a sign that the next session is going to be productive. Add one and get rolling."
            : "Nothing on your plate right now. Enjoy it — the next session will fix that."
        }
        pillDisabledForRoles={!fullEditor}
      />
    </main>
  );
}
