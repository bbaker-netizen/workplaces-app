import { addDays, format } from "date-fns";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementProjects } from "@/lib/db/queries/projects";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { ActionItemForm } from "@/components/action-items/ActionItemForm";
import {
  STATUSES_VISIBLE_TO_CLIENT,
  STATUSES_VISIBLE_TO_COACH,
  type ActionItemStatus,
} from "@/components/action-items/utils";
import type { UserProfile } from "@/lib/db/schema";

/**
 * Pick the sensible default assignee per Q1 (b):
 *   1. The engagement's client_lead.
 *   2. Else any non-Coach member.
 *   3. Else fall back to the current user.
 */
function pickDefaultAssignee(
  members: UserProfile[],
  currentUserProfileId: string,
): string {
  const lead = members.find((m) => m.role === "client_lead");
  if (lead) return lead.id;
  const nonCoach = members.find(
    (m) => m.role !== "master_admin" && m.role !== "coach",
  );
  if (nonCoach) return nonCoach.id;
  return currentUserProfileId;
}

export default async function NewPortalActionItemPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const canCreate =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead";
  if (!canCreate) redirect("/portal/action-items");

  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const [members, projects] = await Promise.all([
    listEngagementMembers(engagement.id),
    listEngagementProjects(engagement.id),
  ]);
  const formMembers = members.map((m) => ({ id: m.id, fullName: m.fullName }));
  const formProjects = projects.map((p) => ({ id: p.id, name: p.name }));

  const isCoachLike =
    profile.role === "master_admin" || profile.role === "coach";
  const statusOptions: readonly ActionItemStatus[] = isCoachLike
    ? STATUSES_VISIBLE_TO_COACH
    : STATUSES_VISIBLE_TO_CLIENT;

  const defaultDue = format(addDays(new Date(), 14), "yyyy-MM-dd");
  const defaultAssignee = pickDefaultAssignee(members, profile.userProfileId);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          New action item
        </h1>
      </header>

      <ActionItemForm
        mode="create"
        engagementId={engagement.id}
        members={formMembers}
        projects={formProjects}
        statusOptions={statusOptions}
        initialValues={{
          title: "",
          description: "",
          status: "open",
          assigneeUserProfileId: defaultAssignee,
          dueDate: defaultDue,
          revenueImpact: false,
          marginImpact: false,
          projectId: null,
        }}
        cancelHref="/portal/action-items"
        successHref="/portal/action-items"
      />
    </main>
  );
}
