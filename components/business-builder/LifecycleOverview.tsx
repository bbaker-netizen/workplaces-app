"use client";

/**
 * LifecycleOverview — animated visual showing the engagement lifecycle.
 *
 * Five phases flow left-to-right with a dotted progress line connecting
 * them. Each phase fades + lifts into place with a staggered delay so
 * it reads like a story building. Hover any phase to slightly lift it.
 * Cards are clickable — drops you straight into the matching surface.
 *
 * Brand-aligned: Drafting Cream backgrounds, Steel Blue ink, Safety
 * Vest Orange accent on the active step. Subtle motion — no Vegas.
 */

import Link from "next/link";
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  FileText,
  Filter,
  Handshake,
  RefreshCw,
} from "lucide-react";

type Phase = {
  number: string;
  label: string;
  blurb: string;
  href: string;
  icon: React.ReactNode;
  accent: string; // tailwind text color for the icon
};

const PHASES: Phase[] = [
  {
    number: "01",
    label: "Prospect",
    blurb: "Lead lands. First contact. Discovery call.",
    href: "/business-builder/pipeline",
    icon: <Filter className="w-5 h-5" aria-hidden />,
    accent: "text-tbb-blue",
  },
  {
    number: "02",
    label: "Sign",
    blurb: "Proposal. Contract out for signature. Signed, then Won.",
    href: "/business-builder/pipeline",
    icon: <Handshake className="w-5 h-5" aria-hidden />,
    accent: "text-tbb-warning",
  },
  {
    number: "03",
    label: "Onboard",
    blurb: "Spin up the engagement. Soul File. Kickoff session on the books.",
    href: "/business-builder/engagements/new",
    icon: <CheckCircle2 className="w-5 h-5" aria-hidden />,
    accent: "text-tbb-success",
  },
  {
    number: "04",
    label: "Run the rhythm",
    blurb: "Twice-monthly BBS. Action items. Deliverables. Projects.",
    href: "/business-builder/deliverables",
    icon: <CalendarClock className="w-5 h-5" aria-hidden />,
    accent: "text-tbb-blue",
  },
  {
    number: "05",
    label: "Bill & renew",
    blurb: "Billing runs in QuickBooks. Renewal proposal at year-end.",
    href: "/business-builder/profile/quickbooks",
    icon: <RefreshCw className="w-5 h-5" aria-hidden />,
    accent: "text-tbb-navy",
  },
];

export function LifecycleOverview() {
  return (
    <div className="relative">
      {/* Dotted connecting line behind the cards (desktop). The mask
          stops it from sticking out past the first/last cards. */}
      <div
        aria-hidden
        className="hidden md:block absolute left-[6%] right-[6%] top-[68px] h-0.5 border-t-2 border-dashed border-tbb-line"
      />

      <ol className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-2 relative">
        {PHASES.map((p, i) => (
          <li
            key={p.number}
            style={{ animationDelay: `${i * 110}ms` }}
            className="opacity-0 animate-[lifecycleFadeIn_500ms_ease-out_forwards]"
          >
            <Link
              href={p.href}
              className="block bg-white border border-tbb-line rounded-xl p-4 shadow-tbb-sm hover:shadow-tbb-md hover:-translate-y-0.5 transition-all duration-tbb-base group h-full"
            >
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 tabular-nums">
                  {p.number}
                </span>
                <span
                  className={
                    "ml-auto grid place-items-center w-10 h-10 rounded-full bg-tbb-cream-50 transition-transform duration-tbb-base group-hover:scale-110 " +
                    p.accent
                  }
                >
                  {p.icon}
                </span>
              </div>
              <p className="font-bold text-tbb-navy text-base leading-tight">
                {p.label}
              </p>
              <p className="mt-1 text-xs text-tbb-ink-3 leading-snug">
                {p.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ol>

      {/* Below-the-cards legend */}
      <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-tbb-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-tbb-blue" />
          Click any phase to jump there
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="w-3 h-3" aria-hidden />
          Full guide below
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="w-3 h-3" aria-hidden />
          Module reference linked at top
        </span>
      </div>
    </div>
  );
}
