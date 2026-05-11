"use client";

/**
 * SessionDetail — client component for the session detail page.
 *
 * Header shows the date/format/status with quick actions:
 *   - "Mark complete" / "Re-open" depending on status
 *   - "Cancel session" (with confirm)
 *   - Inline date/format edit drawer
 *
 * Body is a single notes editor — markdown, persisted via
 * `updateSession`.
 *
 * Receives the server-fetched session as a prop. Status flips revert
 * via `revalidatePath` from the server actions; we surface
 * `isPending` for inline feedback.
 */

import { useState, useTransition } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import {
  cancelSession,
  completeSession,
  deleteSession,
  reopenSession,
  updateSession,
} from "@/lib/actions/bbs-sessions";
import { extractActionItemsFromFireflies } from "@/lib/actions/fireflies-extract";
import { Sparkles } from "lucide-react";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import {
  fromDateTimeLocalValue,
  formatSessionTime,
  SESSION_STATUS_LABEL,
  SESSION_TYPE_LABEL,
  toDateTimeLocalValue,
} from "./utils";

export type SessionDetailData = {
  id: string;
  scheduledAt: Date;
  type: "in_person" | "virtual";
  status: "scheduled" | "completed" | "cancelled";
  notes: string | null;
  firefliesRecordingId: string | null;
};

export function SessionDetail({
  session,
  backHref,
  onAfterDelete,
}: {
  session: SessionDetailData;
  backHref: string;
  onAfterDelete?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingTime, setEditingTime] = useState(false);
  const [timeDraft, setTimeDraft] = useState(
    toDateTimeLocalValue(session.scheduledAt),
  );
  const [typeDraft, setTypeDraft] = useState(session.type);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(session.notes ?? "");

  const isOverdue =
    session.status === "scheduled" && session.scheduledAt < new Date();
  const statusLabel = isOverdue
    ? "Missed"
    : SESSION_STATUS_LABEL[session.status];

  const onComplete = () => {
    setError(null);
    startTransition(async () => {
      const result = await completeSession(session.id);
      if (!result.ok) setError(result.error);
    });
  };
  const onReopen = () => {
    setError(null);
    startTransition(async () => {
      const result = await reopenSession(session.id);
      if (!result.ok) setError(result.error);
    });
  };
  const onCancel = () => {
    if (!window.confirm("Cancel this session?")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelSession(session.id);
      if (!result.ok) setError(result.error);
    });
  };
  const onDelete = () => {
    if (
      !window.confirm(
        "Delete this session permanently? Linked action items stay; only the session record goes.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSession(session.id);
      if (!result.ok) {
        setError(result.error);
      } else {
        onAfterDelete?.();
      }
    });
  };

  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const onExtract = () => {
    setError(null);
    setExtractMessage(null);
    startTransition(async () => {
      const result = await extractActionItemsFromFireflies({
        sessionId: session.id,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setExtractMessage(
          `${result.data.created} draft action items created.`,
        );
      }
    });
  };

  const saveTime = () => {
    const utc = fromDateTimeLocalValue(timeDraft);
    if (Number.isNaN(utc.getTime())) {
      setError("Pick a valid date and time.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateSession(session.id, {
        scheduledAt: utc.toISOString(),
        type: typeDraft,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setEditingTime(false);
      }
    });
  };
  const saveNotes = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateSession(session.id, {
        notes: notesDraft.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setEditingNotes(false);
      }
    });
  };

  return (
    <div className="space-y-8">
      <header className="space-y-3 border border-tbb-line rounded-md bg-white p-4">
        {!editingTime ? (
          <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <h1 className="font-bold text-foreground text-2xl sm:text-3xl tracking-tight">
              {formatSessionTime(session.scheduledAt)}
            </h1>
            <span className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
              {SESSION_TYPE_LABEL[session.type]}
            </span>
            <span
              className={
                "font-mono text-[10px] uppercase tracking-tbb-caps " +
                (isOverdue
                  ? "text-tbb-danger font-bold"
                  : session.status === "completed"
                    ? "text-tbb-navy font-bold"
                    : session.status === "cancelled"
                      ? "text-muted-foreground line-through"
                      : "text-muted-foreground")
              }
            >
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={() => {
                setTimeDraft(toDateTimeLocalValue(session.scheduledAt));
                setTypeDraft(session.type);
                setEditingTime(true);
              }}
              className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-tbb-cream-50"
              aria-label="Edit time and format"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                type="datetime-local"
                value={timeDraft}
                onChange={(e) => setTimeDraft(e.target.value)}
                disabled={isPending}
                className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              />
              <select
                value={typeDraft}
                onChange={(e) =>
                  setTypeDraft(e.target.value as "in_person" | "virtual")
                }
                disabled={isPending}
                className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue"
              >
                <option value="virtual">Virtual</option>
                <option value="in_person">In-person</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTime(false)}
                disabled={isPending}
                className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTime}
                disabled={isPending}
                className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {session.status !== "completed" ? (
            <button
              type="button"
              onClick={onComplete}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps font-bold px-3 py-1.5 rounded-pill bg-tbb-blue-700 text-white hover:bg-tbb-blue disabled:opacity-50"
            >
              Mark complete
            </button>
          ) : (
            <button
              type="button"
              onClick={onReopen}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps font-bold px-3 py-1.5 rounded-pill border border-tbb-line text-foreground hover:bg-tbb-cream-50 disabled:opacity-50"
            >
              Re-open
            </button>
          )}
          {session.status === "scheduled" && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground hover:bg-tbb-cream-50 disabled:opacity-50"
            >
              Cancel session
            </button>
          )}
          <button
            type="button"
            onClick={onExtract}
            disabled={isPending || !session.firefliesRecordingId}
            title={
              session.firefliesRecordingId
                ? "Pull the Fireflies transcript and extract action item drafts"
                : "Add a Fireflies recording id to this session first"
            }
            className="font-sans text-xs uppercase tracking-tbb-caps font-bold px-3 py-1.5 rounded-pill border border-tbb-blue text-tbb-navy hover:bg-tbb-cream-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            Extract action items
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="ml-auto inline-flex items-center gap-1 font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-tbb-danger hover:bg-tbb-cream-50 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            Delete
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="font-sans text-sm text-tbb-danger"
          >
            {error}
          </p>
        )}
        {extractMessage && !isPending && (
          <p className="font-sans text-sm text-tbb-navy border border-tbb-line rounded-md px-3 py-2 bg-tbb-cream-50">
            {extractMessage}
          </p>
        )}
      </header>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-foreground text-lg tracking-tight">
            Notes
          </h2>
          {!editingNotes && (
            <button
              type="button"
              onClick={() => {
                setNotesDraft(session.notes ?? "");
                setEditingNotes(true);
              }}
              className="font-sans text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {session.notes ? "Edit" : "Add notes"}
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={10}
              autoFocus
              disabled={isPending}
              placeholder="Agenda, decisions, follow-ups… (markdown OK)"
              className="w-full bg-white border border-tbb-line rounded-md px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingNotes(false)}
                disabled={isPending}
                className="font-sans text-xs uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNotes}
                disabled={isPending}
                className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                {isPending ? "Saving…" : "Save notes"}
              </button>
            </div>
          </div>
        ) : session.notes ? (
          <div className="border border-tbb-line rounded-md bg-white p-4">
            <MarkdownBody body={session.notes} />
          </div>
        ) : (
          <p className="font-sans text-sm text-muted-foreground italic">
            No notes yet.
          </p>
        )}
      </section>

      <a
        href={backHref}
        className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      >
        ← All sessions
      </a>
    </div>
  );
}
