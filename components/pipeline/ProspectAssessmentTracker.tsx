"use client";

/**
 * Who has done their Person Profile assessment, and by when it's due.
 *
 * Ticked by hand — TTI's link is one shared URL with no per-person identity
 * and no API, so nothing can detect completion. The value is that "who are
 * we still waiting on?" becomes answerable a week before the first session,
 * which is exactly what the deadline in the onboarding email is for.
 */

import { useState, useTransition } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { setAssessmentCompletion } from "@/lib/actions/assessments";

type Participant = {
  n: 1 | 2;
  name: string;
  completedAt: Date | null;
};

export function ProspectAssessmentTracker({
  prospectId,
  participants,
  dueDate,
}: {
  prospectId: string;
  participants: Participant[];
  /** One week before the first session. Null when no session is scheduled
   *  yet — the email then falls back to "one week before our first session"
   *  wording rather than inventing a date. */
  dueDate: Date | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(n: 1 | 2, completed: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setAssessmentCompletion({
        prospectId,
        participant: n,
        completed,
      });
      if (!r.ok) setError(r.error);
    });
  }

  const outstanding = participants.filter((p) => !p.completedAt);
  const overdue =
    dueDate !== null && dueDate < new Date() && outstanding.length > 0;

  return (
    <div className="p-5 space-y-3">
      <ul className="space-y-2">
        {participants.map((p) => (
          <li key={p.n} className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={Boolean(p.completedAt)}
              onChange={(e) => toggle(p.n, e.target.checked)}
              disabled={isPending}
              aria-label={`${p.name} completed their assessment`}
            />
            <span className="font-sans text-sm text-foreground">{p.name}</span>
            {p.completedAt ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-success">
                <Check className="w-3 h-3" aria-hidden />
                {p.completedAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                Not started
              </span>
            )}
          </li>
        ))}
      </ul>

      {dueDate ? (
        <p
          className={
            "font-mono text-[10px] uppercase tracking-tbb-caps " +
            (overdue ? "font-bold text-tbb-blue" : "text-muted-foreground")
          }
        >
          {overdue && (
            <AlertTriangle className="inline w-3 h-3 mr-1" aria-hidden />
          )}
          {overdue ? "Was due " : "Due "}
          {dueDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
          {" · one week before the first session"}
        </p>
      ) : (
        <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
          Due one week before the first session — no session scheduled yet
        </p>
      )}

      <p className="font-sans text-[11px] text-tbb-ink-3">
        Tick these when TTI sends the report through. Nothing detects this
        automatically — the assessment link is a shared one with no way to
        tell who finished.
      </p>
      {error && <p className="font-sans text-xs text-tbb-danger">{error}</p>}
    </div>
  );
}
