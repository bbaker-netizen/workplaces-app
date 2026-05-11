"use client";

/**
 * Welcome modal — first-visit interactive tour of the Business Builder
 * Portal. Five slides that orient a new client to:
 *   1. Welcome (what this place is)
 *   2. Action items + sessions (where they'll spend time)
 *   3. Communication + documents (how to talk + find files)
 *   4. The four pillars (Money / Systems / Time / People)
 *   5. Ready to go
 *
 * Auto-shows on first visit per browser (tracked via localStorage). A
 * "Help / take the tour" link in the footer re-opens it on demand.
 */

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckSquare,
  Coins,
  FileText,
  HeartPulse,
  Loader2,
  MessageSquare,
  Settings,
  Users,
  X,
} from "lucide-react";

const STORAGE_KEY = "bbp-welcome-seen";

type Slide = {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  icon?: React.ReactNode;
};

function buildSlides(firstName: string): Slide[] {
  return [
    {
      eyebrow: "Welcome",
      title: `Welcome to your Business Builder Portal${firstName ? `, ${firstName}` : ""}.`,
      body: (
        <>
          <p>
            This is your private workspace for our coaching engagement —
            a single place for the work we do together. Five quick slides
            and you&apos;ll know where everything lives.
          </p>
          <p className="mt-3 text-sm text-tbb-ink-3">
            You can revisit this tour any time from the &quot;Take the
            tour&quot; link in the footer.
          </p>
        </>
      ),
    },
    {
      eyebrow: "Day to day",
      title: "Action items and sessions.",
      icon: (
        <CheckSquare className="w-12 h-12 text-tbb-blue" strokeWidth={1.75} aria-hidden />
      ),
      body: (
        <>
          <p>
            <strong className="text-tbb-navy">Action items</strong> are the
            commitments coming out of our coaching. Each has an owner, a
            due date, and a status. Check them off as you go.
          </p>
          <p className="mt-3">
            <strong className="text-tbb-navy">Sessions</strong> are our
            Business Building Sessions (BBS) — twice a month, two hours
            each, one in person and one virtual. You&apos;ll see the
            schedule, the agenda, and the notes from each one.
          </p>
        </>
      ),
    },
    {
      eyebrow: "Talk and share",
      title: "Communication and documents.",
      icon: (
        <MessageSquare className="w-12 h-12 text-tbb-blue" strokeWidth={1.75} aria-hidden />
      ),
      body: (
        <>
          <p>
            <strong className="text-tbb-navy">Communication</strong> is
            our message thread between sessions. Use it for quick
            questions, decisions, or anything you want me to see before
            we meet.
          </p>
          <p className="mt-3">
            <strong className="text-tbb-navy">Documents</strong> is where
            every file lives — SOPs, plans, signed contracts,
            assessments. Everything stays in one place; nothing goes to
            Drive.
          </p>
        </>
      ),
    },
    {
      eyebrow: "The work",
      title: "Four pillars: Money, Systems, Time, People.",
      icon: (
        <span className="flex gap-2">
          <Coins className="w-8 h-8 text-tbb-blue" strokeWidth={1.75} aria-hidden />
          <Settings className="w-8 h-8 text-tbb-blue" strokeWidth={1.75} aria-hidden />
          <HeartPulse className="w-8 h-8 text-tbb-blue" strokeWidth={1.75} aria-hidden />
          <Users className="w-8 h-8 text-tbb-blue" strokeWidth={1.75} aria-hidden />
        </span>
      ),
      body: (
        <>
          <p>
            Every piece of work in the portal ties to one of four
            pillars: <strong className="text-tbb-navy">Money</strong>{" "}
            (cash, margin, financials),{" "}
            <strong className="text-tbb-navy">Systems</strong> (how the
            business runs), <strong className="text-tbb-navy">Time</strong>{" "}
            (where it goes), and{" "}
            <strong className="text-tbb-navy">People</strong> (who&apos;s
            doing what).
          </p>
          <p className="mt-3">
            We work the pillar that&apos;s leaking the most. Then the
            next. Build what compounds.
          </p>
        </>
      ),
    },
    {
      eyebrow: "Deliverables",
      title: "The deep work.",
      icon: (
        <FileText className="w-12 h-12 text-tbb-blue" strokeWidth={1.75} aria-hidden />
      ),
      body: (
        <>
          <p>
            <strong className="text-tbb-navy">Deliverables</strong> are
            the longer-form pieces I produce for you — SOPs, org charts,
            job profiles, business plans, financial dashboards, stages of
            growth assessments. Nine types in all.
          </p>
          <p className="mt-3">
            Each one moves top-line revenue, protects margin, or both.
            That&apos;s our quality gate — nothing else ships.
          </p>
        </>
      ),
    },
    {
      eyebrow: "Ready",
      title: "You&apos;re all set.",
      body: (
        <>
          <p>
            That&apos;s the portal. If anything is unclear, click{" "}
            <strong className="text-tbb-navy">Contact support</strong>{" "}
            in the footer of any page.
          </p>
          <p className="mt-3 text-sm text-tbb-ink-3">
            You can revisit this tour any time from the &quot;Take the
            tour&quot; link in the footer.
          </p>
        </>
      ),
    },
  ];
}

export function WelcomeModal({
  firstName,
  forceOpen = false,
  onClose,
}: {
  firstName?: string;
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [step, setStep] = useState<number>(0);
  const slides = buildSlides(firstName ?? "");

  useEffect(() => {
    setHydrated(true);
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        setOpen(true);
      }
    } catch {
      // localStorage may be unavailable (privacy mode); default to closed.
    }
  }, [forceOpen]);

  function dismiss(): void {
    setOpen(false);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      } catch {
        // ignore
      }
    }
    onClose?.();
  }

  function next(): void {
    if (step >= slides.length - 1) {
      dismiss();
      return;
    }
    setStep(step + 1);
  }

  function back(): void {
    if (step === 0) return;
    setStep(step - 1);
  }

  if (!hydrated || !open) return null;

  const slide = slides[step];
  const isLast = step === slides.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-tbb-navy/60 backdrop-blur-sm"
    >
      <div className="bg-white rounded-lg shadow-tbb-lg max-w-lg w-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-tbb-line-soft px-6 py-4">
          <span className="tbb-eyebrow">{slide.eyebrow}</span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close welcome tour"
            className="p-1 rounded-md text-tbb-ink-3 hover:text-tbb-navy hover:bg-tbb-bg-soft transition-colors duration-tbb-base"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="px-6 py-6 space-y-4 min-h-[260px]">
          {slide.icon && <div>{slide.icon}</div>}
          <h2
            id="welcome-modal-title"
            className="text-tbb-h3 font-bold text-tbb-navy tracking-tbb-tight"
            dangerouslySetInnerHTML={{ __html: slide.title }}
          />
          <div className="text-tbb-ink-2 text-base leading-relaxed">
            {slide.body}
          </div>
        </div>

        <div className="px-6 py-4 bg-tbb-bg-soft border-t border-tbb-line-soft flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <span
                key={i}
                aria-hidden
                className={
                  "h-1.5 rounded-pill transition-all duration-tbb-base " +
                  (i === step
                    ? "w-6 bg-tbb-blue"
                    : "w-1.5 bg-tbb-line")
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 text-tbb-ink-3 hover:text-tbb-navy transition-colors duration-tbb-base"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-5 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 transition-colors duration-tbb-base"
            >
              {isLast ? "Get started" : "Next"}
              {!isLast && <ArrowRight className="w-3.5 h-3.5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Loading shim so server-rendered pages don't flash before hydration. */
export function WelcomeModalSkeleton() {
  return (
    <div aria-hidden className="hidden">
      <Loader2 className="w-4 h-4 animate-spin" />
    </div>
  );
}
