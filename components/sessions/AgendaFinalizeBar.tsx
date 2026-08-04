"use client";

/**
 * Finalize an agenda and tell the other Business Builder.
 *
 * One component for both boards — the client-session agenda
 * (`SessionAgenda`) and the internal touch-base (`AgendaBoard`) — because
 * this is the piece with behaviour, and two copies of it would drift into
 * disagreeing about when an agenda counts as changed. The boards
 * themselves stay separate; only the part that matters is shared.
 *
 * Never rendered on the client portal. Finalizing is our declaration that
 * an agenda is ready to prepare from, and the emails it sends go to Bruce
 * and Jen. `lib/actions/agenda-items.ts` re-checks the role server-side —
 * nothing here is a security boundary.
 *
 * Three states, and the difference between the last two is the point:
 *
 *   never finalized  → "Finalize and notify"
 *   finalized, quiet → a dated line, no button. Nothing to say.
 *   finalized, moved → "N since you finalized" + "Send the update"
 *
 * The change count is computed from the items against
 * `agenda_finalized_at`, the same watermark the server measures the
 * delta from, so the button never promises an email the action will
 * then refuse to send.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { finalizeAgenda } from "@/lib/actions/agenda-items";
import { formatSessionTime } from "@/components/sessions/utils";

type Props = {
  sessionId: string;
  /** NULL until the first finalize. */
  finalizedAt: Date | string | null;
  /** Only the timestamps are needed — enough to count what has moved. */
  items: ReadonlyArray<{ createdAt: Date | string; updatedAt: Date | string }>;
  /** False on a past or cancelled session, and for any non-Builder. */
  canFinalize: boolean;
};

function asDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

export function AgendaFinalizeBar({
  sessionId,
  finalizedAt,
  items,
  canFinalize,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const finalized = finalizedAt ? asDate(finalizedAt) : null;

  const changed = finalized
    ? items.filter(
        (i) =>
          asDate(i.createdAt).getTime() > finalized.getTime() ||
          asDate(i.updatedAt).getTime() > finalized.getTime(),
      ).length
    : 0;

  // Nothing to offer and nothing to report.
  if (!canFinalize && !finalized) return null;

  const isUpdate = finalized !== null;
  const nothingToSend = isUpdate && changed === 0;

  function send() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await finalizeAgenda(sessionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const who =
        res.data.notified === 1 ? "1 person" : `${res.data.notified} people`;
      setDone(
        res.data.notified === 0
          ? "Agenda finalized. There is nobody else on this engagement to notify."
          : res.data.isUpdate
            ? `Update sent to ${who}.`
            : `Agenda sent to ${who}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-tbb-line bg-tbb-cream/40 px-3.5 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {finalized ? (
            <p className="font-sans text-sm text-tbb-navy">
              <CheckCircle2
                className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5 text-tbb-success"
                aria-hidden
              />
              Finalized {formatSessionTime(finalized)}
              {changed > 0 && (
                <span className="text-tbb-orange font-bold">
                  {" "}
                  · {changed} change{changed === 1 ? "" : "s"} since
                </span>
              )}
            </p>
          ) : (
            <p className="font-sans text-sm text-tbb-navy">
              This agenda has not been finalized.
            </p>
          )}
          <p className="mt-0.5 font-sans text-xs text-muted-foreground">
            {nothingToSend
              ? "Everyone has the current agenda."
              : isUpdate
                ? "Send the changes so the others can prepare."
                : "Finalizing emails the other Business Builders and invites them to add points."}
          </p>
        </div>

        {canFinalize && !nothingToSend && (
          <button
            type="button"
            disabled={pending || items.length === 0}
            onClick={send}
            title={
              items.length === 0
                ? "Add a point to the agenda first"
                : undefined
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-tbb-navy px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-tbb-caps text-white hover:bg-tbb-blue disabled:opacity-40 transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="w-3.5 h-3.5" aria-hidden />
            )}
            {isUpdate ? "Send the update" : "Finalize and notify"}
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-tbb-orange/10 border border-tbb-orange/30 px-3 py-2 font-sans text-sm text-tbb-orange"
        >
          {error}
        </p>
      )}
      {done && (
        <p className="font-sans text-sm text-tbb-success" role="status">
          {done}
        </p>
      )}
    </div>
  );
}
