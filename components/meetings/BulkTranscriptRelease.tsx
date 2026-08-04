"use client";

/**
 * Release every transcript on an engagement to the client portal, or
 * take them all back.
 *
 * Two taps, always. The first states the count and what it means; the
 * second does it. Releasing a client's whole back catalogue puts
 * everything said in those rooms in front of everyone in the
 * engagement — employees included, per Bruce's decision — so it is not
 * a thing to do by brushing a button. The confirm step is the same
 * reasoning as the two-step EA approval links.
 *
 * The count is stated BEFORE the tap and changes the wording, so
 * "release 31 transcripts" and "release 1" never read the same. A
 * button that would change nothing is disabled rather than firing a
 * no-op that reports success.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setAllTranscriptsShared } from "@/lib/actions/meeting-transcript";

export function BulkTranscriptRelease({
  engagementId,
  totalMeetings,
  releasedCount,
  clientName,
}: {
  engagementId: string;
  totalMeetings: number;
  releasedCount: number;
  clientName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<null | "share" | "unshare">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unreleased = Math.max(0, totalMeetings - releasedCount);

  function run(shared: boolean) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await setAllTranscriptsShared({ engagementId, shared });
      setConfirming(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { changed, failed, remaining } = result.data;
      if (!shared) {
        setMessage(
          changed === 0
            ? "Nothing was released."
            : `Took back ${changed} transcript${changed === 1 ? "" : "s"}. The client can no longer read them.`,
        );
      } else {
        const parts = [
          changed === 0
            ? "No new transcripts were released."
            : `Released ${changed} transcript${changed === 1 ? "" : "s"} to ${clientName}.`,
        ];
        // Never silently short. A run that released 28 of 32 must not
        // read the same as one that released all of them.
        if (failed > 0) {
          parts.push(
            `${failed} had no transcript to release and ${failed === 1 ? "was" : "were"} skipped.`,
          );
        }
        // Bounded by design — pulling bodies from Fireflies has to fit
        // inside one request. Say so plainly and invite another press.
        if (remaining > 0) {
          parts.push(
            `${remaining} still need${remaining === 1 ? "s" : ""} pulling from Fireflies — press again to carry on.`,
          );
        }
        setMessage(parts.join(" "));
      }
      router.refresh();
    });
  }

  if (totalMeetings === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        {confirming === null && (
          <>
            <button
              type="button"
              disabled={pending || unreleased === 0}
              onClick={() => setConfirming("share")}
              className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill border border-tbb-blue text-tbb-blue hover:bg-tbb-blue hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-tbb-blue"
              title={
                unreleased === 0
                  ? "Every transcript on this engagement is already released."
                  : undefined
              }
            >
              <Eye className="w-3.5 h-3.5" aria-hidden />
              Release all transcripts
              {unreleased > 0 && ` (${unreleased})`}
            </button>
            {releasedCount > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming("unshare")}
                className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-danger disabled:opacity-40"
              >
                <EyeOff className="w-3.5 h-3.5" aria-hidden />
                Take all back ({releasedCount})
              </button>
            )}
          </>
        )}

        {confirming !== null && (
          <div className="flex items-center gap-3 flex-wrap rounded-md border border-tbb-line bg-tbb-cream-50/60 px-3.5 py-2.5">
            <p className="font-sans text-sm text-tbb-ink-2 max-w-lg">
              {confirming === "share" ? (
                <>
                  This makes {unreleased} full transcript
                  {unreleased === 1 ? "" : "s"} readable by{" "}
                  <span className="font-bold">everyone</span> in{" "}
                  {clientName}&rsquo;s portal — leads, managers and
                  employees. Everything said in those rooms.
                </>
              ) : (
                <>
                  This hides all {releasedCount} released transcript
                  {releasedCount === 1 ? "" : "s"} from {clientName}
                  &rsquo;s portal again.
                </>
              )}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(confirming === "share")}
              className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60"
            >
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
              {pending
                ? "Working…"
                : confirming === "share"
                  ? "Yes, release them"
                  : "Yes, take them back"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(null)}
              className="font-sans text-xs uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {message && (
        <p className="font-sans text-xs text-tbb-blue border-l-2 border-tbb-blue pl-2.5 py-0.5">
          {message}
        </p>
      )}
      {error && (
        <p className="font-sans text-xs text-tbb-danger border-l-2 border-tbb-danger pl-2.5 py-0.5">
          {error}
        </p>
      )}
    </div>
  );
}
