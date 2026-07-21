/**
 * A single internal team meeting: the agenda, and the commitments that
 * came out of it.
 *
 * Reuses SessionDetail for time / format / notes / status so the
 * internal meeting behaves exactly like every other session in the app,
 * and adds the AgendaBoard on top.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getSession } from "@/lib/db/queries/bbs-sessions";
import { listSessionAgenda } from "@/lib/db/queries/agenda-items";
import {
  getInternalEngagementId,
  isInternalRole,
  listInternalTeammates,
} from "@/lib/db/queries/internal-workspace";
import { SessionDetail } from "@/components/sessions/SessionDetail";
import { AgendaBoard } from "@/components/team/AgendaBoard";

export const dynamic = "force-dynamic";

const TZ = "America/Edmonton";

export default async function TeamMeetingPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (!isInternalRole(profile.role)) redirect("/portal");

  const engagementId = await getInternalEngagementId();
  if (!engagementId) notFound();

  const session = await getSession(params.sessionId);
  // Guard against reaching a CLIENT session through the team route —
  // the id alone must never be enough to change which workspace you're
  // looking at.
  if (!session || session.engagementId !== engagementId) notFound();

  const [agenda, teammates] = await Promise.all([
    listSessionAgenda(session.id),
    listInternalTeammates(),
  ]);

  const isClosed =
    session.status === "cancelled" || session.status === "completed";

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 sm:py-12 space-y-8">
      <header className="space-y-2">
        <Link
          href="/business-builder/team"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Team
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-tbb-navy tracking-tight">
          {session.title ?? "Team meeting"}
        </h1>
        <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-ink-3">
          <CalendarDays className="w-3.5 h-3.5" aria-hidden />
          {session.scheduledAt.toLocaleString("en-CA", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: TZ,
          })}{" "}
          · {session.durationMin} min
        </p>
      </header>

      <AgendaBoard
        sessionId={session.id}
        engagementId={engagementId}
        items={agenda}
        teammates={teammates}
        currentUserProfileId={profile.userProfileId}
        canEdit={!isClosed}
      />

      <SessionDetail
        session={{
          id: session.id,
          scheduledAt: session.scheduledAt,
          type: session.type,
          status: session.status,
          notes: session.notes,
          firefliesRecordingId: session.firefliesRecordingId,
        }}
        backHref="/business-builder/team"
        canManage
      />
    </main>
  );
}
