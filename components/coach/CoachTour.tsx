"use client";

/**
 * Coach workflow walkthrough — first-visit interactive tour.
 *
 * Spotlights each phase of the lifecycle sidebar in order, narrating
 * the end-to-end coach experience: bringing in a prospect, signing
 * them, opening their engagement, running the rhythm, shipping
 * deliverables, invoicing, renewing.
 *
 * Built on react-joyride v3. localStorage flag keeps it from
 * re-firing; the "Run the interactive walkthrough" button on the
 * coach welcome page replays it on demand.
 */

import { useEffect, useState } from "react";
import {
  Joyride,
  type EventData,
  type Step,
  EVENTS,
  STATUS,
} from "react-joyride";

const STORAGE_KEY = "bbp-coach-tour-seen";

const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "The Business Builder Portal — your operating system as a coach.",
    content:
      "I'll walk you through the entire arc of running a client engagement here — from the moment a new prospect lands, all the way through to renewal. Each step in the sidebar represents a phase. We'll go through them in order. About two minutes total.",
  },
  {
    target: '[data-tour="coach-phase-pipeline"]',
    placement: "right",
    skipBeacon: true,
    title: "Phase 01 — Pipeline.",
    content:
      "Every new prospect starts here. The Pipeline view groups them by stage: Diagnostic pending → Complete → Proposal sent → Contract sent → Signed → Onboarded. Two ways prospects land: (a) someone submits the public diagnostic at /diagnostic (auto-creates the record), or (b) you add them manually from the Pipeline page.",
  },
  {
    target: '[data-tour="coach-diagnostic"]',
    placement: "right",
    skipBeacon: true,
    title: "Your public diagnostic — your top-of-funnel.",
    content:
      "Share this URL anywhere you want to capture leads: social profile, email signature, business card. Submissions land in your Pipeline with their answers attached, ready for your follow-up call.",
  },
  {
    target: '[data-tour="coach-phase-engage"]',
    placement: "right",
    skipBeacon: true,
    title: "Phase 02 — Engage.",
    content:
      "Once a prospect is signed, you create the engagement and the rhythm starts. Two Business Building Sessions a month. Action items between each. Communication threads keep you in touch with the client's leadership and operating team. This is where most of your coaching time lives.",
  },
  {
    target: '[data-tour="coach-phase-deliver"]',
    placement: "right",
    skipBeacon: true,
    title: "Phase 03 — Deliver.",
    content:
      "The deeper work — the nine deliverable types (SOPs, org charts, job profiles, financial dashboards, plans, assessments). Projects for app builds and marketing pushes. Goals for SMART outcomes. Hiring for TTI-driven candidate work. Soul File search across every engagement you own.",
  },
  {
    target: '[data-tour="coach-phase-bill"]',
    placement: "right",
    skipBeacon: true,
    title: "Phase 04 — Bill.",
    content:
      "Issue invoices through QuickBooks Online (your default) or Stripe (for the rare cases). The portal posts the invoice to QBO; QBO handles tax, payment, accounting; webhooks bring paid status back automatically. Subscriptions tracks the external services you maintain on the client's behalf — your Model C inventory.",
  },
  {
    target: '[data-tour="coach-phase-practice"]',
    placement: "right",
    skipBeacon: true,
    title: "Phase 05 — Practice operations.",
    content:
      "Your own tools: create a new engagement, upload your stored signature (so contracts auto-sign with your name), connect QuickBooks, open this guide. These don't change client-by-client — they're your standing setup as a coach.",
  },
  {
    target: '[data-tour="coach-guide"]',
    placement: "right",
    skipBeacon: true,
    title: "The full guide is always one click away.",
    content:
      "Coach guide opens the comprehensive operating manual — every phase, every step, every URL, written out in depth. Use the interactive walkthrough (this one) for orientation; use the guide for reference. Both can be replayed any time.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "You're ready to run.",
    content:
      "Start at the top of the sidebar (Pipeline) and work your way down. The first time you go through it, do it with a real prospect — sandbox usage is fine, but the system was built to be used. Build what compounds.",
  },
];

export function CoachTour({
  forceOpen = false,
  onClose,
}: {
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const [run, setRun] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHydrated(true);
    if (forceOpen) {
      setRun(true);
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setRun(true);
    } catch {
      // ignore
    }
  }, [forceOpen]);

  function handleEvent(data: EventData): void {
    const { status, type } = data;
    const finished: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finished.includes(status)) {
      setRun(false);
      try {
        window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      } catch {
        // ignore
      }
      onClose?.();
    }
    if (type === EVENTS.TARGET_NOT_FOUND || type === EVENTS.ERROR) {
      setRun(false);
      onClose?.();
    }
  }

  if (!hydrated) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{
        back: "Back",
        close: "Close",
        last: "Get started",
        next: "Next",
        skip: "Skip",
      }}
      options={{
        arrowColor: "#FFFFFF",
        backgroundColor: "#FFFFFF",
        overlayColor: "rgba(20, 56, 91, 0.55)",
        primaryColor: "#2C6CB0",
        textColor: "#14181D",
        zIndex: 9999,
      }}
      styles={{
        tooltip: {
          borderRadius: 16,
          padding: 0,
          fontFamily:
            'Arial, "Helvetica Neue", Helvetica, system-ui, sans-serif',
          maxWidth: 420,
        },
        tooltipContainer: { textAlign: "left" },
        tooltipTitle: {
          color: "#14385B",
          fontSize: 18,
          fontWeight: 700,
          padding: "20px 20px 4px 20px",
          letterSpacing: "-0.01em",
          lineHeight: 1.25,
        },
        tooltipContent: {
          color: "#2A323B",
          fontSize: 14,
          lineHeight: 1.55,
          padding: "0 20px 16px 20px",
        },
        tooltipFooter: {
          backgroundColor: "#F4F6F9",
          borderTop: "1px solid #E8ECF1",
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
          padding: "12px 16px",
          marginTop: 0,
        },
        buttonPrimary: {
          backgroundColor: "#2C6CB0",
          borderRadius: 9999,
          color: "#FFFFFF",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "10px 18px",
          outline: "none",
        },
        buttonBack: {
          color: "#5A6470",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginRight: 8,
          outline: "none",
        },
        buttonSkip: {
          color: "#5A6470",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          outline: "none",
        },
        buttonClose: {
          color: "#5A6470",
          outline: "none",
          right: 12,
          top: 12,
        },
      }}
    />
  );
}
