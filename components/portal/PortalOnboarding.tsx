"use client";

/**
 * First-login welcome + orientation checklist for a newly-invited client.
 * Mirrors the Business Builder onboarding overlay, but the checklist is
 * pure orientation (clients have no setup tasks) and adapts to the modules
 * their engagement actually has enabled.
 *
 * Shows exactly once, gated server-side by user_profiles.onboarding_completed_at.
 * Any action marks it complete so it never blocks the portal.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Compass,
  FileText,
  ListChecks,
  MessagesSquare,
  X,
} from "lucide-react";
import { completeOnboarding } from "@/lib/actions/onboarding";

const TOUR_SEEN_KEY = "bbp-tour-seen";

type Item = {
  key: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  href?: string;
};

export function PortalOnboarding({
  needsOnboarding,
  firstName,
  enabledModuleKeys,
  engagementName,
}: {
  needsOnboarding: boolean;
  firstName: string;
  enabledModuleKeys: string[];
  engagementName: string | null;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(needsOnboarding);
  const [tourSeen, setTourSeen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      setTourSeen(!!window.localStorage.getItem(TOUR_SEEN_KEY));
    } catch {
      // ignore
    }
  }, []);

  if (!visible) return null;

  function dismissThen(href?: string) {
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

  const has = (k: string) => enabledModuleKeys.includes(k);

  // The tour is always offered; the rest only appear if that module is on.
  const items: Item[] = [
    {
      key: "tour",
      icon: <Compass className="w-5 h-5" aria-hidden />,
      title: "Take the 2-minute tour",
      blurb: "A quick guided look around your portal.",
      // No href — closing the overlay lets the portal tour auto-run.
    },
    ...(has("action_items")
      ? [
          {
            key: "action_items",
            icon: <ListChecks className="w-5 h-5" aria-hidden />,
            title: "See your action items",
            blurb: "The commitments you and your Business Builder are tracking.",
            href: "/portal/action-items",
          },
        ]
      : []),
    ...(has("sessions")
      ? [
          {
            key: "sessions",
            icon: <CalendarClock className="w-5 h-5" aria-hidden />,
            title: "Check your next session",
            blurb: "Your upcoming Business Building Sessions.",
            href: "/portal/sessions",
          },
        ]
      : []),
    ...(has("communication")
      ? [
          {
            key: "communication",
            icon: <MessagesSquare className="w-5 h-5" aria-hidden />,
            title: "Send a message",
            blurb: "Stay in touch between sessions.",
            href: "/portal/communication",
          },
        ]
      : []),
    ...(has("documents")
      ? [
          {
            key: "documents",
            icon: <FileText className="w-5 h-5" aria-hidden />,
            title: "Find your documents",
            blurb: "Every file for your engagement, in one place.",
            href: "/portal/documents",
          },
        ]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: "rgba(20, 56, 91, 0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to your portal"
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
              Welcome, {firstName} 👋
            </h2>
            <p className="text-tbb-ink-2">
              This is your private workspace
              {engagementName ? ` for ${engagementName}` : ""} — where you and
              your Business Builder run the work together. Here&apos;s where to
              start.
            </p>
          </header>

          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => dismissThen(it.href)}
                  disabled={pending}
                  className="w-full text-left flex items-start gap-3 p-3.5 rounded-lg border border-tbb-line bg-white hover:border-tbb-blue hover:bg-tbb-bg-soft transition-colors disabled:opacity-60"
                >
                  <span
                    className={
                      it.key === "tour" && tourSeen
                        ? "text-tbb-success mt-0.5"
                        : "text-tbb-ink-3 mt-0.5"
                    }
                  >
                    {it.key === "tour" && tourSeen ? (
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

          <div className="flex items-center justify-end gap-3 pt-1">
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
