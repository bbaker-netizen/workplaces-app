"use client";

/**
 * TranscriptPanel — read the session, and decide whether the client can.
 *
 * The transcript is loaded on demand rather than with the page: bodies
 * run to hundreds of thousands of characters and most visits to this
 * page are about the follow-through list, not the words.
 *
 * The share control is deliberately blunt about what it does. A
 * released transcript is readable by EVERYONE in the engagement —
 * including the client's employees — and a transcript contains
 * everything said in the room. So the button states the audience rather
 * than saying "share", and turning it on asks for confirmation.
 */

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  loadMeetingTranscript,
  setTranscriptShared,
} from "@/lib/actions/meeting-transcript";

export function TranscriptPanel({
  meetingId,
  sharedAt,
  sharedByName,
}: {
  meetingId: string;
  sharedAt: string | null;
  sharedByName: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [sharing, startSharing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const reveal = () => {
    setOpen(true);
    if (text || unavailable) return;
    startLoading(async () => {
      const r = await loadMeetingTranscript(meetingId);
      if (!r.ok) {
        setUnavailable(r.error);
        return;
      }
      if (r.data.status === "ok") setText(r.data.text);
      else setUnavailable(r.data.reason);
    });
  };

  const toggleShare = () => {
    const next = !sharedAt;
    if (
      next &&
      !confirm(
        "Release this transcript to the client portal?\n\n" +
          "Everyone on this client's team — including employees — will be " +
          "able to read the full word-for-word transcript of this session.\n\n" +
          "You can take it back at any time.",
      )
    ) {
      return;
    }
    setError(null);
    startSharing(async () => {
      const r = await setTranscriptShared({ meetingId, shared: next });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  return (
    <section className="rounded-md border border-tbb-line bg-white">
      <div className="px-4 py-2.5 border-b border-tbb-line-soft flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-tbb-blue" aria-hidden />
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
            Transcript
          </p>
          {sharedAt ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-blue">
              <Eye className="w-3 h-3" aria-hidden /> Client can read this
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-ink-3">
              <EyeOff className="w-3 h-3" aria-hidden /> Internal only
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={toggleShare}
          disabled={sharing}
          className={
            "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill disabled:opacity-50 " +
            (sharedAt
              ? "border border-tbb-line text-tbb-ink-3 hover:text-tbb-navy hover:border-tbb-ink-3"
              : "bg-tbb-blue text-white hover:bg-tbb-blue-700")
          }
        >
          {sharing && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
          {sharedAt ? "Make internal again" : "Release to client"}
        </button>
      </div>

      {sharedAt && (
        <p className="px-4 py-1.5 text-[11px] text-tbb-ink-3 border-b border-tbb-line-soft bg-tbb-cream-50/50">
          Released{" "}
          {new Date(sharedAt).toLocaleString("en-CA", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Edmonton",
          })}
          {sharedByName ? ` by ${sharedByName}` : ""}.
        </p>
      )}
      {error && (
        <p className="px-4 py-2 text-[11px] text-tbb-danger">{error}</p>
      )}

      <div className="px-4 py-3">
        {!open ? (
          <button
            type="button"
            onClick={reveal}
            className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
          >
            Read the transcript
          </button>
        ) : loading ? (
          <p className="inline-flex items-center gap-2 text-xs text-tbb-ink-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            Fetching from Fireflies…
          </p>
        ) : unavailable ? (
          <p className="text-xs text-tbb-ink-3 italic">{unavailable}</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy mb-2"
            >
              Hide
            </button>
            <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-tbb-ink-2 bg-tbb-cream-50/60 rounded-md p-3">
              {text}
            </pre>
          </>
        )}
      </div>
    </section>
  );
}
