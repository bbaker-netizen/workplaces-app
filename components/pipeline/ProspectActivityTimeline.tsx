"use client";

/**
 * Activity timeline for a single prospect — chronological list of
 * calls, emails, meetings, notes, stage changes, signature requests.
 *
 * Includes a quick "log activity" form at the top so a Business
 * Builder can log a phone call or email in one click without
 * leaving the prospect detail page.
 */

import { useState, useTransition } from "react";
import {
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  PenLine,
  Plus,
  Sparkles,
  StickyNote,
  Users,
} from "lucide-react";
import { logProspectActivity } from "@/lib/actions/prospect-activities";
import { ACTIVITY_TYPES, activityTypeLabel } from "@/lib/pipeline/stages";
import type { ProspectActivityWithAuthor } from "@/lib/db/queries/prospects";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: StickyNote,
  stage_change: Sparkles,
  web_lead: Plus,
  signature_request: PenLine,
};

export function ProspectActivityTimeline({
  prospectId,
  activities,
}: {
  prospectId: string;
  activities: ProspectActivityWithAuthor[];
}) {
  const [type, setType] =
    useState<(typeof ACTIVITY_TYPES)[number]["value"]>("note");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!subject.trim() && !body.trim()) {
      setError("Add a subject or body before logging.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await logProspectActivity({
        prospectId,
        type,
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
      });
      if (!r.ok) setError(r.error);
      else {
        setSubject("");
        setBody("");
      }
    });
  }

  return (
    <section className="border border-tbb-line rounded-lg bg-white shadow-tbb-sm">
      <header className="px-5 py-3 border-b border-tbb-line-soft flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
          Activity
        </h2>
        <span className="text-[11px] text-tbb-ink-3 tabular-nums">
          {activities.length} {activities.length === 1 ? "entry" : "entries"}
        </span>
      </header>

      {/* Quick log form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="px-5 py-4 border-b border-tbb-line-soft space-y-2"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {ACTIVITY_TYPES.filter(
            (t) =>
              t.value !== "stage_change" &&
              t.value !== "web_lead" &&
              t.value !== "signature_request",
          ).map((t) => {
            const active = type === t.value;
            const Icon = ICONS[t.value] ?? MessageSquare;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[11px] font-bold uppercase tracking-tbb-caps transition-colors duration-tbb-base " +
                  (active
                    ? "bg-tbb-blue text-white"
                    : "bg-white border border-tbb-line text-tbb-ink-2 hover:border-tbb-blue")
                }
              >
                <Icon className="w-3 h-3" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={isPending}
          placeholder="Subject (e.g., Intro call — 30 min)"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
        />
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={isPending}
          placeholder="What was said, decided, or learned…"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
        />
        {error && (
          <p className="text-sm text-tbb-danger">{error}</p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
          ) : (
            <Plus className="w-3 h-3" aria-hidden />
          )}
          Log activity
        </button>
      </form>

      {/* Timeline */}
      <ul className="px-5 py-4 space-y-4 max-h-[600px] overflow-y-auto">
        {activities.length === 0 ? (
          <li className="text-sm text-tbb-ink-4 italic">
            No activity logged yet.
          </li>
        ) : (
          activities.map((a) => {
            const Icon = ICONS[a.type] ?? MessageSquare;
            return (
              <li key={a.id} className="flex gap-3">
                <div className="flex flex-col items-center flex-none">
                  <span className="w-7 h-7 rounded-pill bg-tbb-blue-100 text-tbb-blue grid place-items-center">
                    <Icon className="w-3.5 h-3.5" aria-hidden />
                  </span>
                  <span className="w-px flex-1 bg-tbb-line-soft mt-1" aria-hidden />
                </div>
                <div className="flex-1 min-w-0 pb-4">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue">
                      {activityTypeLabel(a.type)}
                    </span>
                    <span className="text-[10px] text-tbb-ink-3 tabular-nums">
                      {new Date(a.occurredAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {a.authorName && (
                      <span className="text-[10px] text-tbb-ink-3">
                        by {a.authorName}
                      </span>
                    )}
                  </div>
                  {a.subject && (
                    <p className="font-bold text-tbb-navy mt-0.5">
                      {a.subject}
                    </p>
                  )}
                  {a.body && (
                    <p className="text-sm text-tbb-ink-2 mt-0.5 whitespace-pre-wrap">
                      {a.body}
                    </p>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
