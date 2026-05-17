"use client";

/**
 * Option B mockup — heritage palette, product-y motion.
 * Same brand colours as today, but cards float on hover, hero
 * illustrations on empty states, animated stat counters, micro-
 * interactions throughout. Less ledger, more product.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Coffee,
  FileText,
  Hammer,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

export default function MockupB() {
  return (
    <main className="min-h-screen bg-[#F5F1E8] text-[#1A1A1A]">
      <style jsx global>{`
        @keyframes mockup-fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes mockup-drift {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        @keyframes mockup-stamp {
          0% {
            transform: scale(1.4) rotate(-8deg);
            opacity: 0;
          }
          70% {
            transform: scale(0.95) rotate(-2deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(-2deg);
          }
        }
        .mockup-fade {
          animation: mockup-fadeUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .mockup-drift {
          animation: mockup-drift 4s ease-in-out infinite;
        }
        .mockup-stamp {
          animation: mockup-stamp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .mockup-card {
          transition:
            transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 200ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 200ms ease;
        }
        .mockup-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px -12px rgba(46, 64, 87, 0.18);
          border-color: #2e4057;
        }
      `}</style>

      <TopBar />

      <div className="max-w-6xl mx-auto px-6 py-8 sm:py-12 space-y-10">
        {/* Hero */}
        <header className="mockup-fade space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#E87722]">
            Tuesday · 10:42 AM Mountain
          </p>
          <h1 className="font-black text-[#1A1A1A] text-4xl sm:text-6xl tracking-tight leading-[0.95]">
            Morning, Bruce.
            <br />
            <span className="text-[#2E4057]">Three things matter today.</span>
          </h1>
          <p className="text-[#666] max-w-2xl text-lg">
            Coffee&apos;s already in your hand. Here&apos;s what the next two
            hours could actually move.
          </p>
        </header>

        {/* Stat row */}
        <section className="grid sm:grid-cols-3 gap-4 mockup-fade" style={{ animationDelay: "80ms" }}>
          <Stat icon={<TrendingUp className="w-4 h-4" />} value="$48,000" label="In pipeline this month" tone="orange" />
          <Stat icon={<CheckSquare className="w-4 h-4" />} value="6" label="Things on your plate" tone="navy" />
          <Stat icon={<CalendarClock className="w-4 h-4" />} value="Thu 2PM" label="Next BBS · Impactica" tone="ink" />
        </section>

        {/* Commitments card */}
        <section className="mockup-card mockup-fade border border-[#CCC] rounded-2xl bg-white p-6 sm:p-8 space-y-4 relative overflow-hidden" style={{ animationDelay: "160ms" }}>
          <div
            aria-hidden
            className="absolute top-4 right-4 mockup-stamp"
          >
            <div className="text-[#E87722] border-2 border-[#E87722] rounded font-mono text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 bg-[#E87722]/5">
              Live
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666]">
              Commitments · all clients
            </p>
            <h2 className="font-black text-[#1A1A1A] text-2xl tracking-tight">
              Your plate, in priority order.
            </h2>
          </div>
          <ul className="space-y-1">
            {COMMITMENTS.map((c, i) => (
              <CommitmentRow key={i} {...c} delay={i * 60} />
            ))}
          </ul>
          <div className="pt-2">
            <button className="mockup-card inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em] px-4 py-2 rounded-full bg-[#2E4057] text-white hover:bg-[#1A1A1A]">
              See everything <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </section>

        {/* Empty state with illustration */}
        <section className="grid md:grid-cols-2 gap-4 mockup-fade" style={{ animationDelay: "240ms" }}>
          <div className="mockup-card border border-[#CCC] rounded-2xl bg-white p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#2E4057]" />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666]">
                Goals · zero in flight
              </p>
            </div>
            <BlueprintIllustration />
            <div>
              <p className="font-black text-[#1A1A1A] text-xl tracking-tight">
                Blueprint waiting on you.
              </p>
              <p className="text-sm text-[#666] mt-1">
                Goals are the destinations clients aim at. Set one and
                everything else gets pointed there.
              </p>
            </div>
            <button className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] px-4 py-2 rounded-full bg-[#E87722] text-white hover:bg-[#D86614] shadow-[0_6px_16px_-6px_rgba(232,119,34,0.5)]">
              Set the first one <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="mockup-card border border-[#CCC] rounded-2xl bg-white p-6 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#2E4057]" />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666]">
                Deliverables · 3 in flight
              </p>
            </div>
            <div className="space-y-2">
              {DELIVERABLES.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#F5F1E8] transition-colors"
                >
                  <div className="w-8 h-8 rounded-md bg-[#F5F1E8] border border-[#CCC] flex items-center justify-center">
                    <span className="font-mono text-[10px] font-black text-[#2E4057]">
                      {d.initials}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#1A1A1A] text-sm truncate">
                      {d.title}
                    </p>
                    <p className="text-[11px] text-[#666]">{d.engagement}</p>
                  </div>
                  <div className="w-16 h-1.5 rounded-full bg-[#F5F1E8] overflow-hidden">
                    <div
                      className="h-full bg-[#2E4057] transition-all duration-1000"
                      style={{ width: `${d.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mascot moment */}
        <section className="mockup-fade flex items-start gap-4 border-2 border-dashed border-[#E87722]/40 rounded-2xl bg-[#FFF6EC] p-5" style={{ animationDelay: "320ms" }}>
          <div className="mockup-drift flex-none w-12 h-12 rounded-full bg-[#E87722] text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(232,119,34,0.5)]">
            <Hammer className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#E87722]">
              Buddy says
            </p>
            <p className="text-[#1A1A1A] font-bold mt-0.5">
              Three action items are 24h from going overdue. Want me to
              draft a nudge email to the assignees?
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <button className="text-xs font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-[#E87722] text-white hover:bg-[#D86614]">
                Yes, draft it
              </button>
              <button className="text-xs font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-white text-[#1A1A1A] border border-[#CCC] hover:bg-[#F5F1E8]">
                Not yet
              </button>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mockup-fade text-center py-8 space-y-3" style={{ animationDelay: "400ms" }}>
          <Coffee className="w-8 h-8 text-[#666] mx-auto" />
          <p className="font-black text-[#1A1A1A] text-2xl tracking-tight">
            Build what compounds.
          </p>
          <p className="text-[#666] text-sm max-w-md mx-auto">
            Same heritage brand. New levels of polish, motion, and
            personality on every page.
          </p>
        </section>

        <Footer />
      </div>
    </main>
  );
}

function TopBar() {
  return (
    <div className="border-b border-[#CCC] bg-[#F5F1E8]/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/mockups" className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666] hover:text-[#1A1A1A]">
          ← Back to mockup picker
        </Link>
        <p className="font-black text-[#1A1A1A] tracking-tight">
          The Builder · Option B
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#E87722]">
          Heritage + motion
        </span>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: "orange" | "navy" | "ink";
}) {
  const [shown, setShown] = useState("0");
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 200);
    return () => clearTimeout(t);
  }, [value]);

  const toneClass =
    tone === "orange"
      ? "text-[#E87722]"
      : tone === "navy"
        ? "text-[#2E4057]"
        : "text-[#1A1A1A]";
  return (
    <div className="mockup-card border border-[#CCC] rounded-2xl bg-white p-5 space-y-1">
      <div className={`flex items-center gap-2 ${toneClass}`}>
        {icon}
        <p className="font-mono text-[10px] uppercase tracking-[0.18em]">
          {label}
        </p>
      </div>
      <p
        className={`font-black text-3xl tracking-tight ${toneClass} tabular-nums transition-all duration-700`}
      >
        {shown}
      </p>
    </div>
  );
}

const COMMITMENTS = [
  {
    kind: "Action item",
    title: "Send Q2 hiring plan to Acme leadership",
    eng: "Acme Inc",
    due: "Today",
    overdue: true,
  },
  {
    kind: "Deliverable",
    title: "Org chart v2 — review draft",
    eng: "Impactica",
    due: "Tomorrow",
    overdue: false,
  },
  {
    kind: "Goal",
    title: "Hit $2M ARR by Q4",
    eng: "BlueRiver Construction",
    due: "Dec 31",
    overdue: false,
  },
  {
    kind: "Action item",
    title: "Send proposal to MillCreek",
    eng: "MillCreek Trades",
    due: "Thu",
    overdue: false,
  },
];

function CommitmentRow({
  kind,
  title,
  eng,
  due,
  overdue,
  delay,
}: {
  kind: string;
  title: string;
  eng: string;
  due: string;
  overdue: boolean;
  delay: number;
}) {
  const kindClass =
    kind === "Action item"
      ? "bg-[#2E4057]/10 text-[#2E4057] border-[#2E4057]/30"
      : kind === "Deliverable"
        ? "bg-[#E87722]/10 text-[#E87722] border-[#E87722]/30"
        : "bg-emerald-50 text-emerald-700 border-emerald-300";
  return (
    <li
      className="mockup-fade flex items-baseline gap-3 px-3 py-2 rounded-lg hover:bg-[#F5F1E8] cursor-pointer transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`text-[9px] font-mono font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border ${kindClass}`}
      >
        {kind}
      </span>
      <span className="text-sm font-bold text-[#1A1A1A]">{title}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666]">
        {eng}
      </span>
      <span
        className={`ml-auto font-mono text-[10px] uppercase tracking-[0.18em] ${
          overdue ? "text-[#E87722] font-black" : "text-[#666]"
        }`}
      >
        {overdue ? "Overdue · " : "Due "}
        {due}
      </span>
    </li>
  );
}

const DELIVERABLES = [
  { title: "SOP — Onboarding flow", engagement: "Acme Inc", initials: "SOP", pct: 80 },
  { title: "Financial dashboard v3", engagement: "Impactica", initials: "FIN", pct: 55 },
  { title: "Hiring guide — site foremen", engagement: "BlueRiver", initials: "HG", pct: 30 },
];

function BlueprintIllustration() {
  // Tiny heritage-style line-art blueprint, drifts gently.
  return (
    <div className="mockup-drift h-32 flex items-center justify-center bg-[#F5F1E8] rounded-lg border border-[#CCC]">
      <svg
        viewBox="0 0 200 100"
        className="w-3/4 h-full"
        fill="none"
        stroke="#2E4057"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="20" y="30" width="60" height="50" />
        <rect x="100" y="20" width="40" height="60" />
        <rect x="155" y="40" width="30" height="40" />
        <line x1="30" y1="40" x2="70" y2="40" />
        <line x1="30" y1="50" x2="70" y2="50" />
        <line x1="30" y1="60" x2="60" y2="60" />
        <circle cx="120" cy="50" r="6" stroke="#E87722" strokeWidth="2" />
        <line x1="10" y1="85" x2="190" y2="85" stroke="#999" strokeDasharray="3 3" />
      </svg>
    </div>
  );
}

function Footer() {
  return (
    <div className="border-t border-[#CCC] pt-6 mt-12 flex items-center justify-between flex-wrap gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666]">
        The Builder · By Workplaces
      </p>
      <div className="flex gap-3 text-[11px] text-[#666]">
        <Link href="/mockups" className="hover:text-[#1A1A1A]">
          ← All mockups
        </Link>
        <Link href="/mockups/c" className="hover:text-[#1A1A1A]">
          Compare to Option C →
        </Link>
      </div>
    </div>
  );
}

// Silence unused-import warnings for icons reserved for later mockup
// iterations.
void Sparkles;
void CheckCircle2;
void Users;
