"use client";

/**
 * Inline action on the prospect detail page: open a small drawer with
 * an optional personal note, hit send, the public diagnostic link
 * goes out via email and the prospect's status flips to "Diagnostic
 * sent".
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";
import { sendDiagnosticToProspect } from "@/lib/actions/send-diagnostic";

export function SendDiagnosticButton({
  prospectId,
  recipientName,
  recipientEmail,
}: {
  prospectId: string;
  recipientName: string | null;
  recipientEmail: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSentMessage(null);
    startTransition(async () => {
      const r = await sendDiagnosticToProspect({
        prospectId,
        personalNote: note.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSentMessage(`📋 Diagnostic flying to ${recipientEmail} — and the pipeline now says "waiting on them."`);
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setSentMessage(null);
            setError(null);
          }}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
        >
          <Send className="w-3.5 h-3.5" aria-hidden />
          {open ? "Close" : "Send Diagnostic"}
        </button>
        {sentMessage && (
          <span className="text-[11px] text-tbb-success font-bold">
            ✓ {sentMessage}
          </span>
        )}
      </div>

      {open && (
        <div className="border border-tbb-line rounded-lg bg-tbb-cream-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Sending to {recipientName ? `${recipientName} (${recipientEmail})` : recipientEmail}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-tbb-ink-3 hover:text-tbb-navy"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
              Personal note (optional)
            </span>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending}
              placeholder="Optional — appears as a quoted note in the email. e.g. 'Looking forward to our call next Tuesday — this will help me prep.'"
              className="mt-1 w-full bg-white border border-tbb-line rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tbb-blue resize-y"
            />
          </label>
          {error && (
            <p className="text-xs text-tbb-danger border border-tbb-danger rounded px-2 py-1.5 bg-white">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50 shadow-tbb-cta"
            >
              {isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              )}
              {isPending ? "Firing it off…" : "Send it"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
