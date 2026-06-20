import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
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
          Your scheduled Business Building Sessions are listed below — these are
          set up by us, so there&apos;s nothing you need to do to keep the
          rhythm going. Need <strong>extra time</strong> on top of your regular
          sessions? Request an additional one further down. Recaps from
          completed sessions live under <strong>Meeting notes</strong>.
        </p>
      </header>

      <div className="space-y-10">
        <section className="space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Your scheduled sessions
          </h2>
          <SessionList
            upcoming={upcoming}
            past={past}
            hrefBase="/portal/sessions"
            emptyHeadline="No sessions scheduled yet."
            emptyDescription="Your Business Builder schedules your recurring sessions. Once they're on the calendar they'll appear here with the date and time."
          />
        </section>

        {canSchedule && (
          <section className="border border-tbb-line rounded-lg bg-white p-5 shadow-tbb-xs space-y-3">
            <div className="flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-tbb-blue" aria-hidden />
              <h2 className="font-bold text-tbb-navy text-lg tracking-tight">
                Need more time? Request an additional session
              </h2>
            </div>
            <p className="text-sm text-tbb-ink-3">
              This is only for booking time <strong>on top of</strong> your
              regular sessions. Pick a date and time that works for you and
              we&apos;ll confirm it and send a calendar invite.
            </p>
            <ScheduleSessionForm engagementId={engagement.id} />
          </section>
        )}
      </div>
    </main>
  );
}
