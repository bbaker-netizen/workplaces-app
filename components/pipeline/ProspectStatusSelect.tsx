"use client";

/**
 * Stage pill + inline editor for a prospect's pipeline status.
 *
 * The pill is colour-coded per the Monday-style stage palette. Clicking
 * it opens a native <select> overlay that the user can change inline;
 * the chip background updates immediately and the server action runs
 * in a transition.
 *
 * Closing tactile: when the new status is `contract_signed`, fire a
 * full-screen confetti burst so the close lands as more than a chip
 * colour change. Only triggers on TRANSITIONS into contract_signed —
 * if the prospect is already there, no replay.
 */

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { updateProspect } from "@/lib/actions/prospects";
import { activateProspectAsEngagement } from "@/lib/actions/activate-engagement";
import {
  STAGE_STYLES,
  STAGE_ORDER,
  type ProspectStatus,
  type DisqualificationReason,
} from "@/lib/pipeline/stages";
import { ConfettiBurst } from "@/components/fun/ConfettiBurst";
import { DisqualifyReasonModal } from "./DisqualifyReasonModal";
import {
  hidePendingFeedback,
  showPendingFeedback,
} from "@/components/layout/NavLoaderOverlay";

export function ProspectStatusSelect({
  prospectId,
  current,
  companyName = "this lead",
  currentReason = null,
  alreadyConverted = false,
}: {
  prospectId: string;
  current: ProspectStatus;
  /** Shown in the disqualify-reason modal so the coach knows which lead
   *  they're marking. */
  companyName?: string;
  /** The lead's existing disqualification reason, pre-selected when the
   *  reason modal re-opens on an already-disqualified lead. */
  currentReason?: DisqualificationReason | null;
  /** True once this prospect already has an engagement workspace, so
   *  moving to "Won" doesn't re-offer to start onboarding. */
  alreadyConverted?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<ProspectStatus>(current);
  const [converted, setConverted] = useState(alreadyConverted);
  const [showConfetti, setShowConfetti] = useState(false);
  // When set, the disqualify-reason modal is open for this pending stage move.
  const [pendingDisqualify, setPendingDisqualify] = useState(false);
  const style = STAGE_STYLES[value] ?? STAGE_STYLES.new_lead;

  /** Commit a plain stage move (used for everything except the onboarding
   *  and disqualify intercepts). Optionally carries a disqualify reason. */
  function commitStatus(next: ProspectStatus, reason?: DisqualificationReason) {
    const wasNotSigned = value !== "contract_signed";
    setValue(next);
    showPendingFeedback("Updating stage…");
    startTransition(async () => {
      const r = await updateProspect({
        id: prospectId,
        status: next,
        ...(reason ? { disqualifiedReason: reason } : {}),
      });
      hidePendingFeedback();
      if (!r.ok) {
        setValue(current);
        return;
      }
      if (next === "contract_signed" && wasNotSigned) {
        setShowConfetti(true);
      }
      // Reason drives a report section, so make sure it re-reads.
      if (next === "not_qualified") router.refresh();
    });
  }

  function onChange(next: ProspectStatus) {
    // Disqualifying opens the reason picker first — the reason feeds the
    // Marketing Lead Quality report, so we don't commit without it.
    if (next === "not_qualified") {
      setPendingDisqualify(true);
      return;
    }
    // Reaching "Won" (onboarded) on a prospect that isn't an engagement yet
    // offers to start onboarding in one click — creating the client's
    // workspace — but guarded by a confirm so a mis-click never provisions.
    if (next === "onboarded" && !converted) {
      const go = window.confirm(
        "Mark this client as Won and start onboarding now?\n\n" +
          "This creates their engagement workspace so you can set up their " +
          "portal. It does not email or invite the client yet — you'll do " +
          "that when you're ready.",
      );
      if (!go) return; // Leave the stage where it was.
      setValue(next);
      showPendingFeedback("Starting onboarding…");
      startTransition(async () => {
        const r = await activateProspectAsEngagement(prospectId);
        hidePendingFeedback();
        if (!r.ok) {
          setValue(current);
          window.alert(`Couldn't start onboarding: ${r.error}`);
          return;
        }
        setConverted(true);
        // Take the coach straight to the new client's workspace (with a
        // next-steps banner) instead of leaving them on the pipeline
        // wondering what happened.
        router.push(
          `/business-builder/engagements/${r.data.engagementId}?onboarded=1&drive=${
            r.data.driveCreated ? "created" : "skipped"
          }`,
        );
      });
      return;
    }

    commitStatus(next);
  }

  return (
    <>
      <span className="relative inline-flex items-center gap-1">
        <span
          title="Click to change stage"
          className={
            // Every pill renders at the same fixed width regardless
            // of label length — so "LOST" looks the same size as
            // "MEETING SCHEDULED". Width chosen so the longest
            // label ("MEETING SCHEDULED" = ~134pt of text + padding)
            // fits without truncation. A trailing chevron + ring make
            // it read as an interactive dropdown (the native <select>
            // sits invisibly on top), not a static badge.
            "flex items-center justify-center gap-1 pl-2 pr-1.5 py-1 rounded-pill text-[10.5px] font-bold uppercase tracking-tbb-caps whitespace-nowrap w-[180px] ring-1 ring-inset ring-black/15 " +
            style.chipClass
          }
        >
          {isPending && (
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
          )}
          {style.label}
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden />
        </span>
        <select
          aria-label="Change stage"
          value={value}
          disabled={isPending}
          onChange={(e) => onChange(e.target.value as ProspectStatus)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        >
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>
              {STAGE_STYLES[s].label}
            </option>
          ))}
        </select>
      </span>
      {showConfetti && (
        <ConfettiBurst onDone={() => setShowConfetti(false)} />
      )}
      {pendingDisqualify && (
        <DisqualifyReasonModal
          companyName={companyName}
          initialReason={currentReason}
          onConfirm={(reason) => {
            setPendingDisqualify(false);
            commitStatus("not_qualified", reason);
          }}
          onCancel={() => setPendingDisqualify(false)}
        />
      )}
    </>
  );
}
