"use client";

/**
 * The two values onboarding needs that had nowhere to live: the monthly
 * fee, and the assessment deadline.
 *
 * **Why they are here and not on a settings page somewhere.** The
 * pre-flight refused to start onboarding without a monthly fee and sent
 * the operator to the client page to set it — where no fee control was
 * mounted at all. `EngagementFeeControl` existed in the codebase and was
 * rendered by nothing, and the only fee input in the app was on the
 * new-lead form, which is no use for a client created months ago. So the
 * blocker named a fix that could not be performed.
 *
 * A blocker should be fixable where it is raised. Both fields sit inside
 * the onboarding panel, above the button they gate.
 *
 * The fee normally arrives from the signed agreement and this is the
 * correction path; the assessment date is suggested from the first
 * session and this is where it is confirmed or moved.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import {
  setAssessmentDueDate,
  setEngagementMonthlyFee,
} from "@/lib/actions/engagements";

function centsToInput(cents: number | null): string {
  if (cents === null || cents === undefined) return "";
  return String(Math.round(Number(cents) / 100));
}

export function OnboardingSetupFields({
  engagementId,
  monthlyFeeCents,
  assessmentDueDate,
  suggestedAssessmentDate,
}: {
  engagementId: string;
  monthlyFeeCents: number | null;
  /** Stored value, `YYYY-MM-DD`, or null if never set. */
  assessmentDueDate: string | null;
  /**
   * Worked back from the first scheduled session by the server. Used
   * only to pre-fill an EMPTY field — never to overwrite a date somebody
   * chose, and never saved until they press Save. A suggestion that
   * saves itself is a decision the system made and attributed to you.
   */
  suggestedAssessmentDate: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fee, setFee] = useState(centsToInput(monthlyFeeCents));
  const [due, setDue] = useState(assessmentDueDate ?? suggestedAssessmentDate ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feeDirty = centsToInput(monthlyFeeCents) !== fee.trim();
  const dueDirty = (assessmentDueDate ?? "") !== due;
  const dirty = feeDirty || dueDirty;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      if (feeDirty) {
        const trimmed = fee.trim();
        // Blank clears the fee rather than storing zero — a fee of
        // nothing is not a fee that was set. Same rule the pre-flight
        // applies when it decides the fee is missing.
        const cents =
          trimmed === "" ? null : Math.round(Number(trimmed) * 100);
        if (cents !== null && (!Number.isFinite(cents) || cents < 0)) {
          setError("Enter the monthly fee as a number, e.g. 1500.");
          return;
        }
        const r = await setEngagementMonthlyFee(engagementId, cents);
        if (!r.ok) {
          setError(r.error);
          return;
        }
      }
      if (dueDirty) {
        const r = await setAssessmentDueDate(engagementId, due || null);
        if (!r.ok) {
          setError(r.error);
          return;
        }
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-tbb-line bg-white px-4 py-3 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3">
        Engagement details
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] font-bold text-tbb-navy mb-1">
            Monthly fee
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-tbb-ink-3">$</span>
            <input
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="1500"
              className="w-full rounded-md border border-tbb-line px-2.5 py-1.5 text-sm"
            />
            <span className="text-xs text-tbb-ink-3">/mo</span>
          </div>
          <span className="mt-1 block text-[11px] text-tbb-ink-3">
            From the signed agreement. The payment form authorizes a debit,
            so it needs the amount.
          </span>
        </label>

        <label className="block">
          <span className="block text-[11px] font-bold text-tbb-navy mb-1">
            Assessments due back
          </span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-md border border-tbb-line px-2.5 py-1.5 text-sm"
          />
          <span className="mt-1 block text-[11px] text-tbb-ink-3">
            {assessmentDueDate === null && suggestedAssessmentDate
              ? "Suggested from the first session — change it if that doesn't suit."
              : "The date the client's Person Profile assessments come back."}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          className="inline-flex items-center gap-1.5 font-sans text-xs uppercase tracking-tbb-caps font-bold px-3.5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1 text-xs text-tbb-blue">
            <Check className="w-3.5 h-3.5" aria-hidden /> Saved
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-tbb-danger border-l-2 border-tbb-danger pl-2.5 py-0.5">
          {error}
        </p>
      )}
    </div>
  );
}
