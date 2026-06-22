"use client";

/**
 * First-login welcome + setup checklist for a newly-invited Business
 * Builder. Renders as a full-screen overlay the first time they land in
 * the console (gated server-side by user_profiles.onboarding_completed_at).
 *
 * It shows exactly once: any action — clicking a setup step or "Get
 * started" — marks onboarding complete so it never blocks them again.
 * Server-trackable steps (Google, signature, email signature) show real
 * completion; the walkthrough + guide steps track via localStorage.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Compass,
  CreditCard,
  PenSquare,
  Signature,
  X,
} from "lucide-react";
import { completeOnboarding } from "@/lib/actions/onboarding";
import type { BuilderOnboardingState } from "@/lib/db/queries/onboarding";

const TOUR_SEEN_KEY = "bbp-Coach-tour-seen";
const GUIDE_SEEN_KEY = "bbp-guide-seen";

type Item = {
  key: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  href: string;
  done: boolean;
};

export function BusinessBuilderOnboarding({
  state,
}: {
  state: BuilderOnboardingState;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(state.needsOnboarding);
  const [tourSeen, setTourSeen] = useState(false);
  const [guideSeen, setGuideSeen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      setTourSeen(!!window.localStorage.getItem(TOUR_SEEN_KEY));
      setGuideSeen(!!window.localStorage.getItem(GUIDE_SEEN_KEY));
    } catch {
      // ignore
    }
  }, []);

  if (!visible) return null;

  // Any interaction completes onboarding (so it shows only once), then
  // either navigates to the chosen setup step or closes into the console.
  function dismissThen(href?: string, markGuide?: boolean) {
    if (markGuide) {
      try {
        window.localStorage.setItem(GUIDE_SEEN_KEY, new Date().toISOString());
      } catch {
        // ignore
      }
    }
    startTransition(async () => {
      await completeOnboarding();
      if (href) {
        router.push(href);
      } else {
        setVisible(false);
        router.refresh();
      }
    });
  }

  const items: Item[] = [
    {
      key: "google",
      icon: <CalendarClock className="w-5 h-5" aria-hidden />,
      title: "Connect your Google Workspace",
      blurb: "Calendar sync, Gmail capture, and Drive — all from one connection.",
      href: "/business-builder/profile/google-calendar",
      done: state.googleConnected,
    },
    {
      key: "quickbooks",
      icon: <CreditCard className="w-5 h-5" aria-hidden />,
      title: "Connect QuickBooks",
      blurb: "Reads each client's payments back as their pipeline value.",
      href: "/business-builder/profile/quickbooks",
      done: state.quickbooksConnected,
    },
    {
      key: "signature",
      icon: <Signature className="w-5 h-5" aria-hidden />,
      title: "Upload your e-signature",
      blurb: "So contracts can auto-sign with your name when you send them.",
      href: "/business-builder/profile/signature",
      done: state.hasSignature,
    },
    {
      key: "email-sig",
      icon: <PenSquare className="w-5 h-5" aria-hidden />,
      title: "Set your email signature",
      blurb: "Auto-appended to every email you send from the console.",
      href: "/business-builder/templates",
      done: state.hasEmailSignature,
    },
    {
      key: "walkthrough",
      icon: <Compass className="w-5 h-5" aria-hidden />,
      title: "Take the 2-minute walkthrough",
      blurb: "An interactive tour of the whole engagement lifecycle.",
      href: "/business-builder/welcome",
      done: tourSeen,
    },
    {
      key: "guide",
      icon: <Compass className="w-5 h-5" aria-hidden />,
      title: "Read the operating guide",
      blurb: "The full playbook — every phase, every step, every URL.",
      href: "/business-builder/welcome",
      done: guideSeen,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: "rgba(20, 56, 91, 0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to The Builder"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-tbb-cream shadow-tbb-lg border border-tbb-line">
        <button
          type="button"
          onClick={() => dismissThen()}
          disabled={pending}
          aria-label="Close"
          className="absolute right-4 top-4 text-tbb-ink-3 hover:text-tbb-navy disabled:opacity-50"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>

        <div className="p-6 sm:p-8 space-y-6">
          <header className="space-y-2 pr-8">
            <p className="font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-blue">
              The Builder · By Workplaces
            </p>
            <h2 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
              Welcome aboard, {state.firstName} 👋
            </h2>
            <p className="text-tbb-ink-2">
              You&apos;ve been added as a Business Builder. Here&apos;s a quick
              setup checklist to get you running — knock these out now or come
              back to them anytime.
            </p>
            <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-tbb-ink-3">
              {doneCount} of {items.length} done
            </p>
          </header>

          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() =>
                    dismissThen(it.href, it.key === "guide")
                  }
                  disabled={pending}
                  className="w-full text-left flex items-start gap-3 p-3.5 rounded-lg border border-tbb-line bg-white hover:border-tbb-blue hover:bg-tbb-bg-soft transition-colors disabled:opacity-60"
                >
                  <span
                    className={
                      it.done ? "text-tbb-success mt-0.5" : "text-tbb-ink-3 mt-0.5"
                    }
                  >
                    {it.done ? (
                      <CheckCircle2 className="w-5 h-5" aria-hidden />
                    ) : (
                      <Circle className="w-5 h-5" aria-hidden />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 text-tbb-navy font-bold">
                      <span className="text-tbb-blue">{it.icon}</span>
                      {it.title}
                    </span>
                    <span className="block text-sm text-tbb-ink-3 mt-0.5">
                      {it.blurb}
                    </span>
                  </span>
                  <ArrowRight
                    className="w-4 h-4 text-tbb-ink-3 mt-1 shrink-0"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => dismissThen()}
              disabled={pending}
              className="text-sm font-bold text-tbb-ink-3 hover:text-tbb-navy disabled:opacity-50"
            >
              I&apos;ll set up later
            </button>
            <button
              type="button"
              onClick={() => dismissThen()}
              disabled={pending}
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2.5 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 disabled:opacity-60 shadow-tbb-cta"
            >
              {pending ? "Opening…" : "Get started"}
              <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
