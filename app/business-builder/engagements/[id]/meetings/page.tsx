/**
 * /business-builder/engagements/[id]/meetings — every Fireflies-synced
 * meeting for this client engagement, newest first.
 *
 * The index. Meeting metadata (title, date, duration, attendees) plus
 * the Fireflies summary, with a link into each meeting's workspace —
 * which is where drafting, review, assignment and transcript release
 * all happen. Nothing is drafted from this page; it is the way in.
 *
 * "Sync from Fireflies" button at the top triggers the per-engagement
 * sync action. Skips transcripts already synced in the last 24h to
 * keep the call count down.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  Eye,
  Users,
  Video,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import {
  engagementMeetings,
  engagements,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { SyncMeetingsButton } from "@/components/meetings/SyncMeetingsButton";
import { countDraftsByMeeting } from "@/lib/db/queries/meeting-workspace";
import { dayPreview, groupMeetingsByDay } from "@/lib/meetings/grouping";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import {
  cleanMeetingTitle,
  formatMeetingSummary,
} from "@/lib/meetings/format";

export default async function EngagementMeetingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }
  if (!(await canCurrentBbAccessEngagement(id))) {
    redirect("/business-builder/engagements");
  }

  const data = await withSystemContext(async (tx) => {
    const [eng] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.id, id))
      .limit(1);
    if (!eng) return null;
    const meetings = await tx
      .select()
      .from(engagementMeetings)
      .where(eq(engagementMeetings.engagementId, id))
      .orderBy(desc(engagementMeetings.occurredAt), asc(engagementMeetings.id));
    return { eng, meetings, draftCounts: await countDraftsByMeeting(id) };
  });

  if (!data) notFound();

  const newestSyncAt = data.meetings[0]?.lastSyncedAt ?? null;

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <Link
          href={`/business-builder/engagements/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Workspace
        </Link>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight flex items-center gap-2">
          <Video className="w-7 h-7" aria-hidden /> Meetings
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Every Fireflies-recorded meeting that included someone from{" "}
          <span className="font-bold">{data.eng.name ?? "this engagement"}</span>.
          Pulled on demand — hit Sync to fetch the latest. Open a
          meeting&rsquo;s workspace to draft to-dos and documents from
          its transcript, review them, and release the transcript to the
          client.
        </p>
        <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
          <SyncMeetingsButton engagementId={id} />
          {newestSyncAt && (
            <p className="text-[11px] text-tbb-ink-3">
              Last synced{" "}
              {new Date(newestSyncAt).toLocaleString("en-CA", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </header>

      {data.meetings.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-3">
          <Video className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">
            No meetings synced yet.
          </p>
          <p className="text-sm text-tbb-ink-3 max-w-md mx-auto">
            Click <span className="font-bold">Sync from Fireflies</span> above to
            pull every meeting that included someone from this engagement.
            If Fireflies has nothing for these emails yet, this list will
            stay empty.
          </p>
        </div>
      ) : (
        // Grouped by day. A busy on-site morning produces one Fireflies
        // recording per conversation — thirteen, in A&M Abatement's case
        // — and flat they read as thirteen separate meetings. Nothing is
        // hidden; a day is shown as a day. See lib/meetings/grouping.ts.
        <div className="space-y-6">
          {groupMeetingsByDay(data.meetings).map((g) => (
            <section key={g.dayKey} className="space-y-2">
              <h2 className="flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-ink-3">
                {g.dayLabel}
                {g.meetings.length > 1 && (
                  <span className="text-tbb-blue font-bold">
                    {g.meetings.length} recordings
                  </span>
                )}
              </h2>
              {g.meetings.length > 1 ? (
                <details className="border border-tbb-line-soft rounded-lg bg-tbb-cream-50/60">
                  <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-tbb-ink-3 hover:text-tbb-navy">
                    <span className="font-bold text-tbb-navy">
                      {g.meetings.length} recordings from this day
                    </span>
                    <span className="block mt-0.5 truncate">
                      {dayPreview(g.meetings.map((m) => m.title))}
                    </span>
                  </summary>
                  <ul className="space-y-3 p-3 pt-0">
                    {g.meetings.map((m) => (
                      <MeetingCard
                      key={m.id}
                      meeting={m}
                      engagementId={id}
                      draftCount={data.draftCounts.get(m.id) ?? 0}
                    />
                    ))}
                  </ul>
                </details>
              ) : (
                <ul className="space-y-3">
                  {g.meetings.map((m) => (
                    <MeetingCard
                      key={m.id}
                      meeting={m}
                      engagementId={id}
                      draftCount={data.draftCounts.get(m.id) ?? 0}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function MeetingCard({
  meeting,
  engagementId,
  draftCount,
}: {
  meeting: typeof engagementMeetings.$inferSelect;
  engagementId: string;
  draftCount: number;
}) {
  const attendees = Array.isArray(meeting.attendees)
    ? (meeting.attendees as Array<{ email: string | null; name: string | null }>)
    : [];
  return (
    <li className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
      {/* Native <details> = collapse with no client JS. Collapsed by
          default so the list stays scannable. */}
      <details className="group">
        {/* Two fixed lines, always: title, then metadata beneath it.
            Title and date used to share one wrapping row, so a long title
            shoved the chevron onto a line of its own and every row was a
            different height. Worse, the date started at a different x on
            every row, so there was no column for the eye to follow. */}
        <summary className="cursor-pointer list-none px-5 py-3 bg-tbb-cream-50/40 flex items-center justify-between gap-3 hover:bg-tbb-cream-50">
          <div className="min-w-0 flex-1">
            <h3
              className="font-bold text-tbb-navy truncate"
              title={cleanMeetingTitle(meeting.title)}
            >
              {cleanMeetingTitle(meeting.title)}
            </h3>
            <div className="flex items-center gap-3 mt-0.5">
            <span className="inline-flex items-center gap-1 text-xs text-tbb-ink-3">
              <CalendarDays className="w-3 h-3" aria-hidden />
              {new Date(meeting.occurredAt).toLocaleString("en-CA", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/Edmonton",
              })}
            </span>
            {typeof meeting.durationMin === "number" && (
              <span className="text-xs text-tbb-ink-3">
                · {meeting.durationMin} min
              </span>
            )}
            </div>
          </div>
          <ChevronDown
            className="w-4 h-4 text-tbb-ink-3 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="px-5 py-4 space-y-3 border-t border-tbb-line-soft">
          {/* One way in. Drafting, reviewing, assigning, the transcript
              and its release control all live on the workspace page now
              — the two rival buttons that used to sit here were the
              redundancy this replaced. */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href={`/business-builder/engagements/${engagementId}/meetings/${meeting.id}`}
              className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
            >
              <ClipboardList className="w-3.5 h-3.5" aria-hidden />
              Open workspace
            </Link>
            {draftCount > 0 && (
              <span className="font-mono text-[11px] font-bold text-tbb-blue">
                {draftCount} waiting for review
              </span>
            )}
            {meeting.transcriptSharedAt && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-blue">
                <Eye className="w-3 h-3" aria-hidden /> Transcript released
              </span>
            )}
            {meeting.transcriptUrl && (
              <a
                href={meeting.transcriptUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-blue"
              >
                <ExternalLink className="w-3 h-3" aria-hidden /> Fireflies
              </a>
            )}
          </div>
          {meeting.summaryOverview && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mb-1">
                Overview
              </p>
              <MarkdownBody body={meeting.summaryOverview} />
            </section>
          )}
          {meeting.summaryBullets && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mb-1">
                Highlights
              </p>
              <MarkdownBody body={formatMeetingSummary(meeting.summaryBullets)} />
            </section>
          )}
          {meeting.summaryKeywords && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mb-1">
                Keywords
              </p>
              <p className="text-sm text-tbb-ink-3">{meeting.summaryKeywords}</p>
            </section>
          )}
          {attendees.length > 0 && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 mb-1 inline-flex items-center gap-1">
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
          {!meeting.summaryOverview &&
            !meeting.summaryBullets &&
            !meeting.summaryKeywords && (
              <p className="text-xs text-tbb-ink-3 italic">
                No summary returned by Fireflies for this meeting.
                {meeting.transcriptUrl && " Open it in Fireflies to read the full transcript."}
              </p>
            )}
        </div>
      </details>
    </li>
  );
}
