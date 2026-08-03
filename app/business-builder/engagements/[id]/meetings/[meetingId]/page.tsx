/**
 * The meeting workspace — one page per session.
 *
 * Bruce's ask, verbatim: "I just need this in one central area because
 * what we have right now is redundant and confusing." Before this, a
 * session's output was spread across the Meetings library (two rival
 * drafting buttons), the Action items module, the Deliverables module
 * and the BBS session page.
 *
 * This page holds all of it: the recap, the transcript with its release
 * control, everything drafted out of the session waiting for review,
 * everything already published, and a way to add what the transcript
 * missed. One drafting button, not two — the type picker beside it
 * decides whether Claude writes a long-form document instead of
 * commitments.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, CalendarDays, ExternalLink, Users } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import { getMeetingWorkspace } from "@/lib/db/queries/meeting-workspace";
import { userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { FollowThroughBoard } from "@/components/meetings/FollowThroughBoard";
import { TranscriptPanel } from "@/components/meetings/TranscriptPanel";
import { MeetingDraftControls } from "@/components/meetings/MeetingDraftControls";
import { cleanMeetingTitle, formatMeetingSummary } from "@/lib/meetings/format";

export default async function MeetingWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const { id, meetingId } = await params;
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }
  if (!(await canCurrentBbAccessEngagement(id))) {
    redirect("/business-builder/engagements");
  }

  const ws = await getMeetingWorkspace(meetingId);
  if (!ws) notFound();
  // Hard check that this meeting really belongs to the engagement in the
  // URL. Access was authorized against `id`; without this, a meeting id
  // from another client would render here under an engagement the caller
  // legitimately holds. Same guard as the internal-team session route.
  if (ws.meeting.engagementId !== id) notFound();

  const sharedByName = ws.meeting.transcriptSharedByUserProfileId
    ? await withSystemContext(async (tx) => {
        const [u] = await tx
          .select({ name: userProfiles.fullName })
          .from(userProfiles)
          .where(eq(userProfiles.id, ws.meeting.transcriptSharedByUserProfileId!))
          .limit(1);
        return u?.name ?? null;
      })
    : null;

  const attendees = Array.isArray(ws.meeting.attendees)
    ? (ws.meeting.attendees as Array<{ email: string | null; name: string | null }>)
    : [];

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 space-y-5">
      <header className="space-y-2">
        <Link
          href={`/business-builder/engagements/${id}/meetings`}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Meetings
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          {cleanMeetingTitle(ws.meeting.title)}
        </h1>
        <div className="flex items-center gap-3 flex-wrap text-xs text-tbb-ink-3">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="w-3 h-3" aria-hidden />
            {new Date(ws.meeting.occurredAt).toLocaleString("en-CA", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/Edmonton",
            })}
          </span>
          {typeof ws.meeting.durationMin === "number" && (
            <span>· {ws.meeting.durationMin} min</span>
          )}
          {ws.engagementName && <span>· {ws.engagementName}</span>}
          {ws.meeting.transcriptUrl && (
            <a
              href={ws.meeting.transcriptUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
            >
              <ExternalLink className="w-3 h-3" aria-hidden /> Fireflies
            </a>
          )}
        </div>
      </header>

      <MeetingDraftControls meetingId={meetingId} />

      <FollowThroughBoard
        engagementId={id}
        meetingId={meetingId}
        items={ws.items}
        members={ws.members}
      />

      <TranscriptPanel
        meetingId={meetingId}
        sharedAt={
          ws.meeting.transcriptSharedAt
            ? new Date(ws.meeting.transcriptSharedAt).toISOString()
            : null
        }
        sharedByName={sharedByName}
      />

      {(ws.meeting.summaryOverview || ws.meeting.summaryBullets) && (
        <section className="rounded-md border border-tbb-line bg-white px-4 py-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Fireflies recap
          </p>
          {ws.meeting.summaryOverview && (
            <MarkdownBody body={ws.meeting.summaryOverview} />
          )}
          {ws.meeting.summaryBullets && (
            <MarkdownBody body={formatMeetingSummary(ws.meeting.summaryBullets)} />
          )}
        </section>
      )}

      {attendees.length > 0 && (
        <section className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 inline-flex items-center gap-1">
            <Users className="w-3 h-3" aria-hidden /> Attendees
          </p>
          <ul className="flex flex-wrap gap-1">
            {attendees.map((a, i) => (
              <li
                key={i}
                className="text-[11px] text-tbb-ink-3 bg-tbb-cream-50 px-2 py-0.5 rounded-pill"
              >
                {a.name ?? a.email ?? "Unknown"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
