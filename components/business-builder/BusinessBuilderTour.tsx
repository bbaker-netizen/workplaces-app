"use client";

/**
 * Coach workflow walkthrough — first-visit interactive tour.
 *
 * Spotlights each phase of the lifecycle sidebar in order, narrating
 * the end-to-end Coach experience: bringing in a prospect, signing
 * them, opening their engagement, running the rhythm, shipping
 * deliverables, invoicing, renewing.
 *
 * Built on react-joyride v3. localStorage flag keeps it from
 * re-firing; the "Run the interactive walkthrough" button on the
 * Coach welcome page replays it on demand.
 */

import { useEffect, useState } from "react";
import {
  Joyride,
  type EventData,
  type Step,
  EVENTS,
  STATUS,
} from "react-joyride";

const STORAGE_KEY = "bbp-Coach-tour-seen";

const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "Welcome to your Business Builder console.",
    content:
      "A two-minute orientation to how you run a client engagement here — from a new prospect landing, all the way to renewal. The left sidebar is grouped by lifecycle phase; I'll walk you through each. You can replay this anytime from the Business Builder guide.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "First — connect your tools.",
    content:
      "A few one-time connections you make yourself, under your Profile: Google (Calendar + Gmail + Drive), QuickBooks, and your e-signature. These make the app send from YOUR Gmail, sync YOUR calendar, and sign with YOUR name. (Text messaging and the cloud account for embedded apps are set up once for the whole practice by a master admin — not per person.)",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "Phase 01 — Pipeline.",
    content:
      "Every prospect starts here — your CRM, grouped by stage. Add them by scanning a business card on your phone, manually, or let them land automatically when someone fills out your public diagnostic. Click the stage chip to move a prospect; open them to email, schedule, send the diagnostic, or send a contract for signature.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "Phase 02 — Engage.",
    content:
      "Once they're signed, you open the engagement and the rhythm starts: two Business Building Sessions a month, action items between each, and Leadership/Team communication threads. Your Inbox collects every email/SMS/call across all clients (reply and compose right there), and the Calendar shows every session and due date in one view.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "Set up each client's portal.",
    content:
      "Open an engagement to reach its workspace page — the per-client hub. There you choose which modules the client sees, add apps to their portal (sync your Netlify projects under Client tools & tutorials first, then add them here), write the Soul File, and hit 'Invite client' to send their sign-up. You can prepare everything first and invite later.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "Phase 03 — Deliver.",
    content:
      "The deeper work: the nine deliverable types (SOPs, org charts, job profiles, financial dashboards, plans, assessments), Projects for larger initiatives with a task grid, Goals for SMART targets, and the Hiring pipeline for TTI-driven candidate work.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "Phase 04 — Bill.",
    content:
      "Billing happens directly in QuickBooks Online — you invoice clients there as always. The Builder doesn't create invoices; it reads each client's payments back from QBO and shows them as the 'Value' on your Pipeline.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "Help is always one click away.",
    content:
      "Stuck on anything? Click Builder Buddy (the orange beacon, bottom-right) — it's an AI assistant that knows the app, the methodology, and the page you're on. The Business Builder guide in the sidebar is the full written reference.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "You're ready to run.",
    content:
      "Start at the top of the sidebar and work down. Best way to learn it is to use it with a real client. Build what compounds.",
  },
];

export function BusinessBuilderTour({
  forceOpen = false,
  suppressAuto = false,
  onClose,
}: {
  forceOpen?: boolean;
  /** When true, don't auto-run on first visit (e.g. the welcome checklist
   *  overlay is showing). `forceOpen` still works for manual replay. */
  suppressAuto?: boolean;
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
    if (suppressAuto) return;
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setRun(true);
    } catch {
      // ignore
    }
  }, [forceOpen, suppressAuto]);

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
        last: "Got it — let me go",
        next: "Next",
        nextWithProgress: "Next ({current}/{total})",
        skip: "Skip the tour",
      }}
      options={{
        arrowColor: "#FFFFFF",
        backgroundColor: "#FFFFFF",
        overlayColor: "rgba(20, 56, 91, 0.55)",
        primaryColor: "#2C6CB0",
        textColor: "#14181D",
        zIndex: 9999,
        // Show the Skip button in every step's footer so the walkthrough
        // never feels like a hostage situation. The X in the corner also
        // exits the whole tour (closeButtonAction: 'skip'). Esc and the
        // overlay are already 'close' actions by default.
        buttons: ["skip", "back", "primary"],
        closeButtonAction: "skip",
        showProgress: true,
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
