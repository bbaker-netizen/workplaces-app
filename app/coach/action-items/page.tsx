import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachActionItems } from "@/lib/db/queries/action-items";
import { sortActionItems } from "@/components/action-items/sort";
import { ActionItemListClient } from "@/components/action-items/ActionItemListClient";
import {
  STATUSES_VISIBLE_TO_COACH,
  type ActionItemStatus,
} from "@/components/action-items/utils";

export default async function CoachActionItemsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const all = await listCoachActionItems();
  const sorted = sortActionItems(all);

  const items = sorted.map((it) => ({
    id: it.id,
    title: it.title,
    description: it.description,
    status: it.status as ActionItemStatus,
    assigneeName: it.assigneeName,
    dueDate: it.dueDate,
    revenueImpact: it.revenueImpact,
    marginImpact: it.marginImpact,
    engagementName: it.engagementName,
    detailHref: `/coach/action-items/${it.id}`,
  }));

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Action items — all engagements
        </h1>
        <p className="font-sans text-muted-foreground max-w-md leading-relaxed">
          Cross-engagement view. Drafts are visible to Business Builder roles only — the
          chip is empty in 1.2 and fills in 1.6 with Fireflies AI extraction.
        </p>
      </header>

      <ActionItemListClient
        items={items}
        statusOptions={STATUSES_VISIBLE_TO_COACH}
        newItemHref="/coach/action-items/new"
        emptyHeadline="No action items yet"
        emptyDescription="Create one to start tracking — or wait for AI extraction in 1.6."
      />
    </main>
  );
}
