import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
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
        <h1 className="font-display font-bold text-foreground text-3xl tracking-tight">
          No engagement yet
        </h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Your portal isn&apos;t bound to an engagement. If you expect access,
          contact your coach.
        </p>
      </main>
    );
  }

  const isCoachLike =
    profile.role === "master_admin" || profile.role === "coach";
  const allItems = await listEngagementActionItems(engagement.id);
  const sorted = sortActionItems(allItems);

  // Hide drafts from non-coach roles.
  const visibleItems = isCoachLike
    ? sorted
    : sorted.filter((i) => i.status !== "draft");

  const statusOptions: readonly ActionItemStatus[] = isCoachLike
    ? STATUSES_VISIBLE_TO_COACH
    : STATUSES_VISIBLE_TO_CLIENT;

  // Roles allowed to create from the portal: master_admin, coach,
  // client_lead. Lower roles get no New button.
  const canCreate =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead";

  // For non-full-editor roles, the status pill is also restricted —
  // they can only update items assigned to them. Phase 1.2 simplifies:
  // disable the pill for these roles unless we add per-card logic.
  // Acceptable for now; refine in Phase 2 if it bites.
  const fullEditor =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead";

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
  }));

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          Action items
        </h1>
      </header>

      <ActionItemListClient
        items={items}
        statusOptions={statusOptions}
        newItemHref={canCreate ? "/portal/action-items/new" : null}
        emptyHeadline="Nothing here yet"
        emptyDescription={
          canCreate
            ? "Create your first action item to get rolling."
            : "Your coach will publish action items here after your next session."
        }
        pillDisabledForRoles={!fullEditor}
      />
    </main>
  );
}
