"use client";

/**
 * Modal composer for replying to an inbox row. Opens from the Reply
 * button on each email row, pre-fills To / Subject / threading
 * headers from the source message, and submits through the same
 * `sendClientMessage` server action the prospect/engagement comms
 * panel uses. Means the reply:
 *
 *   - Lands in the recipient's inbox via the coach's connected Gmail
 *     (so it appears in their Sent folder + the conversation lives
 *     under their Gmail thread)
 *   - Gets captured into client_communications so it shows up in
 *     this inbox + the source record's timeline
 *   - Carries the Gmail threading headers so the reply stitches
 *     into the right conversation, not a new thread
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Loader2, Send, X } from "lucide-react";
import { sendClientMessage } from "@/lib/actions/send-client-message";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/communication/RichTextEditor";

export type InboxComposerRow = {
  id: string;
  channel: string;
  direction: "inbound" | "outbound";
  fromAddress: string | null;
  toAddresses: string[];
  subject: string | null;
  body: string;
  externalId: string | null;
  threadKey: string | null;
  prospectId: string | null;
  engagementId: string | null;
  prospectName: string | null;
  engagementName: string | null;
  occurredAt: Date;
};

export function InboxReplyButton({ row }: { row: InboxComposerRow }) {
  const [open, setOpen] = useState(false);
  // Replies only make sense for email (SMS / WhatsApp replies happen
  // through their own channel; phone/meeting notes aren't replyable).
  if (row.channel !== "email") return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-tbb-caps px-2.5 py-1 rounded-pill border border-tbb-line bg-white text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue"
        title="Reply via Gmail"
      >
        <CornerUpLeft className="w-3 h-3" aria-hidden /> Reply
      </button>
      {open && (
        <InboxComposerModal row={row} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function InboxComposerModal({
  row,
  onClose,
}: {
  row: InboxComposerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  // Default the reply-to address. Inbound emails: send back to the
  // sender. Outbound: send to the first recipient (continuing a
  // thread we started).
  const initialTo =
    row.direction === "inbound"
      ? row.fromAddress ?? row.toAddresses[0] ?? ""
      : row.toAddresses[0] ?? "";
  const initialSubject = (() => {
    const s = (row.subject ?? "").trim();
    if (!s) return "Re:";
    return /^re:/i.test(s) ? s : `Re: ${s}`;
  })();
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Lock scroll while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function send() {
    setError(null);
    if (!to.trim() || !/.+@.+\..+/.test(to)) {
      setError("Add a valid recipient email.");
      return;
    }
    if (!subject.trim()) {
      setError("Add a subject.");
      return;
    }
    const md = editorRef.current?.getMarkdown() ?? body;
    if (!md.trim()) {
      setError("Write something before sending.");
      return;
    }
    if (!row.prospectId && !row.engagementId) {
      setError(
        "This message isn't linked to a prospect or engagement, so the app doesn't know where to file the reply.",
      );
      return;
    }
    startTransition(async () => {
      const r = await sendClientMessage({
        prospectId: row.prospectId,
        engagementId: row.engagementId,
        channel: "email",
        to: [to.trim()],
        subject: subject.trim(),
        body: md.trim(),
        inReplyTo: row.externalId ?? undefined,
        references: row.threadKey ?? row.externalId ?? undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reply via email"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <header className="px-5 py-3 border-b border-tbb-line flex items-center gap-3">
          <CornerUpLeft className="w-4 h-4 text-tbb-blue" aria-hidden />
          <p className="font-bold text-tbb-navy">Reply</p>
          <p className="text-xs text-tbb-ink-3">
            via your connected Gmail
          </p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md hover:bg-tbb-cream-50 text-tbb-ink-3 hover:text-tbb-navy"
            aria-label="Close"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>
        <div className="px-5 py-4 space-y-3">
          {(row.prospectName || row.engagementName) && (
            <p className="text-[11px] text-tbb-ink-3">
              Replying to{" "}
              <strong className="text-tbb-navy">
                {row.prospectName ?? row.engagementName}
              </strong>{" "}
              · message captured{" "}
              {row.occurredAt.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              To
            </span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={isPending}
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isPending}
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Message
            </span>
            <div className="mt-1">
              <RichTextEditor
                editorRef={editorRef}
                onChange={setBody}
                placeholder="Write your reply…"
                disabled={isPending}
                ariaLabel="Reply body"
              />
            </div>
          </label>
          {row.subject && (
            <details className="text-xs text-tbb-ink-3">
              <summary className="cursor-pointer text-tbb-ink-3 hover:text-tbb-navy">
                Show original message
              </summary>
              <blockquote className="mt-2 pl-3 border-l-2 border-tbb-line text-tbb-ink-3 whitespace-pre-wrap">
                <p className="font-bold">{row.subject}</p>
                <p>{row.body.slice(0, 1500)}</p>
              </blockquote>
            </details>
          )}
          {error && (
            <p
              role="alert"
              className="text-sm text-tbb-danger border border-tbb-danger rounded-md px-3 py-2 bg-tbb-cream-50"
            >
              {error}
            </p>
          )}
        </div>
        <footer className="px-5 py-3 border-t border-tbb-line flex items-center gap-3 bg-tbb-cream-50">
          <button
            type="button"
            onClick={send}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="w-3.5 h-3.5" aria-hidden />
            )}
            {isPending ? "Sending…" : "Send reply"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
          >
            Cancel
          </button>
          <p className="ml-auto text-[10px] text-tbb-ink-3">
            Threads back into the original conversation in your Gmail.
          </p>
        </footer>
      </div>
    </div>
  );
}
