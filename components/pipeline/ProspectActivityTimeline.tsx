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
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  FileText,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  PenLine,
  Plus,
  Sparkles,
  StickyNote,
  Users,
  X,
} from "lucide-react";
import {
  logProspectActivity,
  updateProspectActivity,
} from "@/lib/actions/prospect-activities";
import { ACTIVITY_TYPES, activityTypeLabel } from "@/lib/pipeline/stages";
import type { ProspectActivityWithAuthor } from "@/lib/db/queries/prospects";

// Entry types a Business Builder wrote by hand and can edit. System-
// generated entries (stage changes, web leads, signature/diagnostic/QBO
// events) are a factual record and stay read-only.
const EDITABLE_TYPES = new Set(["call", "meeting", "note", "email"]);

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: StickyNote,
  stage_change: Sparkles,
  web_lead: Plus,
  signature_request: PenLine,
  diagnostic_sent: Mail,
  qbo_linked: Link2,
  follow_up: CalendarClock,
  document: FileText,
};

export function ProspectActivityTimeline({
  prospectId,
  activities,
  embedded = false,
}: {
  prospectId: string;
  activities: ProspectActivityWithAuthor[];
  /** When inside a CollapsibleSection, drop the card chrome + title. */
  embedded?: boolean;
}) {
  const router = useRouter();
  // A single, general log entry — no type picker. Meetings get logged when
  // you schedule them and calls/anything else are just a note, so every
  // manual entry is stored as a plain "note".
  const [type] =
    useState<(typeof ACTIVITY_TYPES)[number]["value"]>("note");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Inline edit of an existing entry.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditPending, startEditTransition] = useTransition();

  function beginEdit(a: ProspectActivityWithAuthor) {
    setEditingId(a.id);
    setEditSubject(a.subject ?? "");
    setEditBody(a.body ?? "");
    setEditError(null);
  }
  function saveEdit() {
    if (!editBody.trim()) {
      setEditError("Write a note.");
      return;
    }
    setEditError(null);
    const id = editingId;
    if (!id) return;
    startEditTransition(async () => {
      const r = await updateProspectActivity({
        id,
        subject: editSubject.trim() || null,
        body: editBody.trim() || null,
      });
      if (!r.ok) {
        setEditError(r.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function submit() {
    if (!body.trim()) {
      setError("Write a note before logging.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await logProspectActivity({
        prospectId,
        type,
        body: body.trim() || undefined,
      });
      if (!r.ok) setError(r.error);
      else {
        setBody("");
      }
    });
  }

  const Wrapper = embedded ? "div" : "section";
  return (
    <Wrapper
      className={
        embedded ? "" : "border border-tbb-line rounded-lg bg-white shadow-tbb-sm"
      }
    >
      {!embedded && (
        <header className="px-5 py-3 border-b border-tbb-line-soft flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Activity
          </h2>
          <span className="text-[11px] text-tbb-ink-3 tabular-nums">
            {activities.length} {activities.length === 1 ? "entry" : "entries"}
          </span>
        </header>
      )}

      {/* Quick log form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="px-5 py-4 border-b border-tbb-line-soft space-y-2"
      >
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={isPending}
          spellCheck
          placeholder="Log a call, site visit, or quick note — what was said, decided, or learned…"
          className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
        />
        <p className="text-[11px] text-tbb-ink-3">
          Tip: give it a quick spelling &amp; grammar check — teammates read
          these notes, so clear beats fast.
        </p>
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
                <div className="flex-1 min-w-0 pb-4 group">
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
                    {EDITABLE_TYPES.has(a.type) && editingId !== a.id && (
                      <button
                        type="button"
                        onClick={() => beginEdit(a)}
                        className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue opacity-0 group-hover:opacity-100 focus:opacity-100 hover:underline"
                      >
                        <Pencil className="w-3 h-3" aria-hidden /> Edit
                      </button>
                    )}
                  </div>

                  {editingId === a.id ? (
                    <div className="mt-1.5 space-y-2">
                      <textarea
                        rows={3}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        disabled={isEditPending}
                        spellCheck
                        placeholder="What was said, decided, or learned…"
                        className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
                      />
                      {editError && (
                        <p className="text-sm text-tbb-danger">{editError}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={isEditPending}
                          className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
                        >
                          {isEditPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                          ) : (
                            <Check className="w-3 h-3" aria-hidden />
                          )}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={isEditPending}
                          className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
                        >
                          <X className="w-3 h-3" aria-hidden /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </Wrapper>
  );
}
