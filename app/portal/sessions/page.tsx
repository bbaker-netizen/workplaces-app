import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementSessions } from "@/lib/db/queries/bbs-sessions";
import { ScheduleSessionForm } from "@/components/sessions/ScheduleSessionForm";
import { SessionList } from "@/components/sessions/SessionList";

export default async function PortalSessionsPage() {
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

  const canSchedule =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  const { upcoming, past } = await listEngagementSessions(engagement.id);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Sessions
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Business Building Sessions for this engagement. Twice-monthly,
          two hours — one in person, one virtual.
        </p>
      </header>

      <div className="space-y-8">
        {canSchedule && (
          <ScheduleSessionForm engagementId={engagement.id} />
        )}
        <SessionList
          upcoming={upcoming}
          past={past}
          hrefBase="/portal/sessions"
          emptyHeadline="No sessions yet"
          emptyDescription={
            canSchedule
              ? "Schedule your first session above."
              : "Your Business Builder will schedule sessions here."
          }
        />
      </div>
    </main>
  );
}
