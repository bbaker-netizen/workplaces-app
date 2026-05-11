"use client";

/**
 * Interactive product tour for the Business Builder Portal.
 *
 * Built on react-joyride v3. Spotlights each real element on the
 * dashboard with a tooltip floating next to it. Users can step
 * through with Next/Back, skip, or click directly on any spotlit
 * element to interact.
 *
 * - Auto-runs on first visit per browser (localStorage flag).
 * - Replays via the "Take the tour" footer link.
 * - Each step targets a `data-tour="<id>"` attribute on a real
 *   element in the dashboard (see app/portal/page.tsx and
 *   PortalFooter.tsx).
 */

import { useEffect, useState } from "react";
import {
  Joyride,
  type EventData,
  type Step,
  EVENTS,
  STATUS,
} from "react-joyride";

const STORAGE_KEY = "bbp-tour-seen";

const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "Welcome to your Business Builder Portal.",
    content:
      "This is your private workspace for our coaching engagement. I'll walk you through what's on screen — about a minute. You can click on anything to explore as we go.",
  },
  {
    target: '[data-tour="action-items"]',
    placement: "left",
    skipBeacon: true,
    title: "Your open action items.",
    content:
      "Everything you've committed to is here, sorted overdue-first then by due date. Click any item to open it, add a comment, or mark it done. Coming out of a coaching session, this is the list that grows.",
  },
  {
    target: '[data-tour="next-session"]',
    placement: "right",
    skipBeacon: true,
    title: "Your next Business Building Session.",
    content:
      "We meet twice a month — one in person, one virtual. The next one shows up here with the date, time, and any agenda I've started. Click All sessions to see history.",
  },
  {
    target: '[data-tour="communication"]',
    placement: "left",
    skipBeacon: true,
    title: "Latest messages.",
    content:
      "Use Communication for anything between sessions — questions, decisions, file shares, things you want me to see before we meet. Two thread types: Leadership (private to you + leaders) and Team (everyone you've invited). Mention with @name to email-notify.",
  },
  {
    target: '[data-tour="soul-file"]',
    placement: "right",
    skipBeacon: true,
    title: "Your Soul File.",
    content:
      "The long-form context document for our engagement: why this business exists, where it's at, where it's heading, what we've learned. I write and maintain it; you read whenever you want the big picture in one place.",
  },
  {
    target: '[data-tour="documents"]',
    placement: "top",
    skipBeacon: true,
    title: "Every file we touch.",
    content:
      "SOPs, plans, signed contracts, assessments — everything lives here. Click any file to download. No more emailing attachments around or chasing down a Drive link.",
  },
  {
    target: '[data-tour="contact-support"]',
    placement: "top",
    skipBeacon: true,
    title: "Need help? Reach me here.",
    content:
      "I monitor this address Monday–Friday, 8:30 AM – 6:00 PM Mountain Time. For anything during business hours, this is the fastest path to me.",
  },
  {
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "You're ready.",
    content:
      "That's the portal. The four pillars (Money / Systems / Time / People) frame everything we work on — we attack the one leaking the most, then the next. Build what compounds. You can replay this tour any time from 'Take the tour' in the footer.",
  },
];

export function PortalTour({
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
      // localStorage may be unavailable in private mode.
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
    // Joyride sometimes can't find a target (e.g. user navigated mid-tour).
    // Stop quietly so the UI doesn't lock up.
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
          maxWidth: 400,
        },
        tooltipContainer: {
          textAlign: "left",
        },
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
