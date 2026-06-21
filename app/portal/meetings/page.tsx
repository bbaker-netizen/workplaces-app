/**
 * /portal/meetings — client-facing Fireflies meeting recaps.
 *
 * Read-only list of every recorded Business Building Session for this
 * engagement: title, when, duration, the Fireflies summary, and a
 * clickable "View recording & notes" link (a hyperlink, never the raw
 * URL). Data comes from `engagement_meetings`, synced coach-side; the
 * query is RLS-scoped so a client only ever sees their own.
 */

import { redirect } from "next/navigation";
import { ChevronDown, ExternalLink, Video } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementMeetings } from "@/lib/db/queries/meetings";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { MeetingSearch } from "@/components/meetings/MeetingSearch";
import { formatMeetingSummary } from "@/lib/meetings/format";

function formatMeetingDate(d: Date): string {
  return new Date(d).toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
  });
}

export default async function PortalMeetingsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const meetings = await listEngagementMeetings(engagement.id);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Meeting notes
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Recaps and recordings from your Business Building Sessions. Click
          &ldquo;View recording &amp; notes&rdquo; to open the full meeting.
        </p>
      </header>

      {meetings.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-2">
          <Video className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">No meeting notes yet.</p>
          <p className="text-sm text-tbb-ink-3 max-w-md mx-auto">
            After your sessions are recorded, the recap and a link to the
            recording show up here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <MeetingSearch />
          <ul className="space-y-3">
          {meetings.map((m) => (
            <li
              key={m.id}
              className="border border-tbb-line rounded-lg bg-white shadow-tbb-xs overflow-hidden"
            >
              {/* Collapsed by default so the list stays scannable. */}
              <details className="group">
                <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3.5 hover:bg-tbb-cream-50 transition-colors">
                  <div className="shrink-0 w-12 rounded-lg bg-tbb-blue/10 text-tbb-blue flex flex-col items-center justify-center py-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-tbb-caps leading-none">
                      {new Date(m.occurredAt).toLocaleDateString("en-CA", {
                        month: "short",
                        timeZone: "America/Edmonton",
                      })}
                    </span>
                    <span className="text-lg font-black leading-tight tabular-nums">
                      {new Date(m.occurredAt).toLocaleDateString("en-CA", {
                        day: "numeric",
                        timeZone: "America/Edmonton",
                      })}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-tbb-navy text-[15px] leading-snug truncate">
                      {m.title}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMeetingDate(m.occurredAt)}
                      {m.durationMin ? ` · ${m.durationMin} min` : ""}
                    </p>
                  </div>
                  <ChevronDown
                    className="w-4 h-4 text-tbb-ink-3 shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="px-5 py-4 space-y-3 border-t border-tbb-line-soft">
                  {m.transcriptUrl && (
                    <a
                      href={m.transcriptUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                      View recording &amp; notes
                    </a>
                  )}
                  {m.summaryOverview && <MarkdownBody body={m.summaryOverview} />}
                  {m.summaryBullets && (
                    <MarkdownBody body={formatMeetingSummary(m.summaryBullets)} />
                  )}
                  {!m.summaryOverview && !m.summaryBullets && (
                    <p className="text-sm text-tbb-ink-3 italic">
                      {m.transcriptUrl
                        ? "Recap coming soon — the recording link above has the full meeting."
                        : "Recap coming soon."}
                    </p>
                  )}
                </div>
              </details>
            </li>
          ))}
          </ul>
        </div>
      )}
    </main>
  );
}
