import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { listEngagementSessions } from "@/lib/db/queries/bbs-sessions";
import { ScheduleSessionForm } from "@/components/sessions/ScheduleSessionForm";
import { SessionList } from "@/components/sessions/SessionList";

export default async function CoachSessionsPage({
  params,
}: {
  params: { engagementId: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const engagements = await listCoachEngagements();
  const engagement = engagements.find((e) => e.id === params.engagementId);
  if (!engagement) notFound();

  const { upcoming, past } = await listEngagementSessions(engagement.id);

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 sm:py-12 space-y-10">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Coach Console
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {engagement.name ?? "Engagement"} · Sessions
        </h1>
        <nav className="flex gap-3 text-xs font-mono uppercase tracking-[0.2em]">
          <Link
            href="/coach"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Coach
          </Link>
          {engagements.length > 1 && (
            <details className="relative">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none">
                Switch engagement
              </summary>
              <div className="absolute left-0 mt-2 z-10 bg-white border border-[#CCCCCC] rounded-md shadow-md py-1 min-w-[14rem]">
                {engagements.map((e) => (
                  <Link
                    key={e.id}
                    href={`/coach/sessions/${e.id}`}
                    className="block px-3 py-1.5 text-foreground hover:bg-[#F5F1E8] normal-case tracking-normal font-sans text-sm"
                  >
                    {e.name ?? e.id.slice(0, 8)}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
      </header>

      <ScheduleSessionForm engagementId={engagement.id} />
      <SessionList
        upcoming={upcoming}
        past={past}
        hrefBase={`/coach/sessions/${engagement.id}`}
        emptyHeadline="No sessions yet"
        emptyDescription="Schedule the first BBS for this engagement above."
      />
    </main>
  );
}
