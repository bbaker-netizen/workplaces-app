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
import { ExternalLink, Video } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementMeetings } from "@/lib/db/queries/meetings";

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
        <ul className="space-y-4">
          {meetings.map((m) => {
            const bullets = (m.summaryBullets ?? "")
              .split("\n")
              .map((b) => b.replace(/^[-•*]\s*/, "").trim())
              .filter(Boolean);
            return (
              <li
                key={m.id}
                className="border border-tbb-line rounded-lg bg-white p-5 shadow-tbb-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="font-bold text-tbb-navy text-lg">
                      {m.title}
                    </h2>
                    <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                      {formatMeetingDate(m.occurredAt)}
                      {m.durationMin ? ` · ${m.durationMin} min` : ""}
                    </p>
                  </div>
                  {m.transcriptUrl && (
                    <a
                      href={m.transcriptUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                      View recording &amp; notes
                    </a>
                  )}
                </div>

                {m.summaryOverview && (
                  <p className="text-sm text-tbb-ink-2 leading-relaxed">
                    {m.summaryOverview}
                  </p>
                )}
                {bullets.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-tbb-ink-2">
                    {bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
                {!m.summaryOverview && bullets.length === 0 && (
                  <p className="text-sm text-tbb-ink-3 italic">
                    {m.transcriptUrl
                      ? "Recap coming soon — the recording link above has the full meeting."
                      : "Recap coming soon."}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
