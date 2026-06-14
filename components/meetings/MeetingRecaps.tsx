/**
 * MeetingRecaps — read-only list of Fireflies-synced meeting recaps for
 * the client portal. Shows each meeting's date, the AI overview, and the
 * key bullets. Server component (no interactivity).
 */

import { Sparkles } from "lucide-react";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { formatSessionTime } from "@/components/sessions/utils";

export type MeetingRecap = {
  id: string;
  title: string;
  occurredAt: Date;
  summaryOverview: string | null;
  summaryBullets: string | null;
  transcriptUrl: string | null;
};

export function MeetingRecaps({ meetings }: { meetings: MeetingRecap[] }) {
  if (meetings.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-tbb-blue" aria-hidden />
        <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Session recaps (from Fireflies)
        </h2>
      </div>
      <ul className="space-y-3">
        {meetings.map((m) => (
          <li
            key={m.id}
            className="border border-tbb-line rounded-md bg-white p-4 space-y-2"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="font-bold text-foreground">{m.title}</span>
              <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                {formatSessionTime(m.occurredAt)}
              </span>
            </div>
            {m.summaryOverview && (
              <p className="text-sm text-muted-foreground">
                {m.summaryOverview}
              </p>
            )}
            {m.summaryBullets && (
              <div className="text-sm">
                <MarkdownBody body={m.summaryBullets} />
              </div>
            )}
            {m.transcriptUrl && (
              <a
                href={m.transcriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-blue hover:underline"
              >
                Open full transcript →
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
