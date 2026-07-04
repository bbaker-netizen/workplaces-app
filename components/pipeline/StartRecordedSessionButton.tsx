"use client";

/**
 * "Start a recorded session" — creates a Google Meet now and invites the
 * Fireflies notetaker to join and record it. On success it shows the Meet
 * link to join.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radio, Video, Loader2, ExternalLink } from "lucide-react";
import { startRecordedSession } from "@/lib/actions/start-recorded-session";

export function StartRecordedSessionButton({
  prospectId,
}: {
  prospectId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteContact, setInviteContact] = useState(true);

  function go() {
    setError(null);
    setMeetLink(null);
    startTransition(async () => {
      const r = await startRecordedSession({ prospectId, inviteContact });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMeetLink(r.data.meetLink);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-tbb-ink-3">
        Spin up a Google Meet right now and have <strong>Fireflies</strong>{" "}
        join and record it. When the call wraps, its transcript syncs back
        and drafts your action items — same as a scheduled BBS session.
      </p>
      <label className="flex items-center gap-2 text-xs text-tbb-ink-2">
        <input
          type="checkbox"
          checked={inviteContact}
          onChange={(e) => setInviteContact(e.target.checked)}
          disabled={pending}
          className="accent-tbb-blue"
        />
        Also email the client an invite to join
      </label>
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Radio className="w-3.5 h-3.5" aria-hidden />
        )}
        {pending ? "Starting…" : "Start a recorded session"}
      </button>

      {error && <p className="text-sm text-tbb-danger">{error}</p>}

      {meetLink && (
        <div className="rounded-lg border border-tbb-line bg-tbb-cream/40 p-3 space-y-2">
          <p className="text-xs text-tbb-ink-2">
            Session ready — Fireflies has been invited and will join to
            record. Join the call:
          </p>
          <a
            href={meetLink}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-success text-white hover:brightness-95"
          >
            <Video className="w-3.5 h-3.5" aria-hidden /> Join the Meet
            <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
          <p className="text-[11px] text-tbb-ink-4 break-all">{meetLink}</p>
        </div>
      )}
    </div>
  );
}
