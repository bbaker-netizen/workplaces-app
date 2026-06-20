/**
 * /business-builder/engagements/[id]/meetings — every Fireflies-synced
 * meeting for this client engagement, newest first.
 *
 * Shows meeting metadata (title, date, duration, attendees) + the
 * Fireflies-generated summary (overview + bullets + keywords). Does
 * NOT auto-extract action items — that pipeline stays on the BBS
 * session detail page where it has Bruce's full attention.
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
  ExternalLink,
  Users,
  Video,
} from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  engagementMeetings,
  engagements,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { SyncMeetingsButton } from "@/components/meetings/SyncMeetingsButton";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

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
    return { eng, meetings };
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
          Pulled on demand — hit Sync to fetch the latest. Action item
          extraction stays on the BBS session page; this is the
          reference library.
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
        <ul className="space-y-3">
          {data.meetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </ul>
      )}
    </main>
  );
}

function MeetingCard({
  meeting,
}: {
  meeting: typeof engagementMeetings.$inferSelect;
}) {
  const attendees = Array.isArray(meeting.attendees)
    ? (meeting.attendees as Array<{ email: string | null; name: string | null }>)
    : [];
  return (
    <li className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm overflow-hidden">
      {/* Native <details> = collapse with no client JS. Collapsed by
          default so the list stays scannable. */}
      <details className="group">
        <summary className="cursor-pointer list-none px-5 py-3 bg-tbb-cream-50/40 flex items-center justify-between gap-3 flex-wrap hover:bg-tbb-cream-50">
          <div className="flex items-baseline gap-3 flex-wrap min-w-0">
            <h3 className="font-bold text-tbb-navy">{meeting.title}</h3>
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
          <ChevronDown
            className="w-4 h-4 text-tbb-ink-3 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="px-5 py-4 space-y-3 border-t border-tbb-line-soft">
          {meeting.transcriptUrl && (
            <a
              href={meeting.transcriptUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
            >
              <ExternalLink className="w-3 h-3" aria-hidden /> Open in Fireflies
            </a>
          )}
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
              <MarkdownBody body={meeting.summaryBullets} />
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
