import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { getGoal } from "@/lib/db/queries/goals";
import { listEngagementMembers } from "@/lib/db/queries/user-profiles";
import { GoalForm } from "@/components/goals/GoalForm";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

export default async function PortalGoalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const goal = await getGoal(params.id);
  if (!goal) notFound();

  const canEdit =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  const members = canEdit
    ? await listEngagementMembers(engagement.id)
    : [];

  if (!canEdit) {
    // Read-only view for client_employee.
    return (
      <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
        <header className="space-y-2">
          <Link
            href="/portal/goals"
            className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
          >
            ← All goals
          </Link>
          <h1 className="font-bold text-foreground text-3xl tracking-tight leading-none">
            {goal.title}
          </h1>
          <div className="flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
            {goal.targetMetric && (
              <span>
                Target: <span className="text-foreground">{goal.targetMetric}</span>
                {goal.targetValue && (
                  <> · <span className="text-foreground">{goal.targetValue}</span></>
                )}
              </span>
            )}
            {goal.targetDate && (
              <span>
                By {goal.targetDate.toLocaleDateString()}
              </span>
            )}
            {goal.ownerName && <span>Owner: {goal.ownerName}</span>}
          </div>
        </header>
        {goal.description && (
          <div className="border border-tbb-line rounded-md bg-white p-4">
            <MarkdownBody body={goal.description} />
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/portal/goals"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← All goals
        </Link>
        <h1 className="font-bold text-foreground text-3xl tracking-tight leading-none">
          Edit goal
        </h1>
      </header>

      <GoalForm
        engagementId={engagement.id}
        initial={{
          id: goal.id,
          title: goal.title,
          description: goal.description ?? "",
          targetMetric: goal.targetMetric ?? "",
          targetValue: goal.targetValue ?? "",
          targetDate: goal.targetDate
            ? goal.targetDate.toISOString().slice(0, 10)
            : "",
          status: goal.status,
          revenueImpact: goal.revenueImpact,
          marginImpact: goal.marginImpact,
          ownerUserProfileId: goal.ownerUserProfileId,
        }}
        members={members.map((m) => ({ id: m.id, fullName: m.fullName }))}
        redirectTo="/portal/goals"
        showDelete
      />
    </main>
  );
}
