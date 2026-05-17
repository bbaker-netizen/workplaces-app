"use client";

/**
 * Middle-path mockup — Option B/C blend.
 *
 * Keeps the heritage palette (Drafting Cream as accents, Foreman
 * Black for ink, Safety Vest Orange + Steel Blue brand colours) but
 * pulls in the modern AI-app moves from Option C: soft gradient
 * wash, glassy cards with hover lift, animated stat counters,
 * pulse-ring live indicators, shimmer headline, glowing CTA. No
 * dark mode, no mesh — bright, warm, modern. Reads like a 2026
 * product, not a 1972 ledger.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  FileText,
  Hammer,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

export default function MockupMiddle() {
  return (
    <main className="min-h-screen bg-[#FAFAF7] text-[#1A1A1A] relative overflow-hidden">
      <style jsx global>{`
        @keyframes m-wash {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.7;
          }
          50% {
            transform: translate3d(-15px, 15px, 0) scale(1.04);
            opacity: 0.9;
          }
        }
        @keyframes m-wash-2 {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.6;
          }
          50% {
            transform: translate3d(20px, -20px, 0) scale(1.06);
            opacity: 0.8;
          }
        }
        @keyframes m-fadeUp {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes m-shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        @keyframes m-pulse-orange {
          0% {
            box-shadow: 0 0 0 0 rgba(232, 119, 34, 0.55);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(232, 119, 34, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(232, 119, 34, 0);
          }
        }
        @keyframes m-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }
        .m-wash-1 {
          animation: m-wash 14s ease-in-out infinite;
        }
        .m-wash-2 {
          animation: m-wash-2 16s ease-in-out infinite;
        }
        .m-fade {
          animation: m-fadeUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .m-float {
          animation: m-float 4.5s ease-in-out infinite;
        }
        .m-shimmer {
          background: linear-gradient(
            90deg,
            #1a1a1a 0%,
            #1a1a1a 40%,
            #e87722 50%,
            #1a1a1a 60%,
            #1a1a1a 100%
          );
          background-size: 200% auto;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: m-shimmer 5s linear infinite;
        }
        .m-card {
          background: #ffffff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          box-shadow: 0 1px 2px rgba(26, 26, 26, 0.04);
          transition:
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 220ms ease;
        }
        .m-card:hover {
          transform: translateY(-3px);
          border-color: rgba(46, 64, 87, 0.25);
          box-shadow: 0 18px 40px -16px rgba(46, 64, 87, 0.18);
        }
        .m-pulse {
          animation: m-pulse-orange 2.4s ease-out infinite;
        }
        .m-orange-cta {
          background: linear-gradient(135deg, #e87722 0%, #f59042 100%);
          box-shadow: 0 10px 28px -8px rgba(232, 119, 34, 0.5);
          transition:
            transform 200ms ease,
            box-shadow 200ms ease;
        }
        .m-orange-cta:hover {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 14px 32px -8px rgba(232, 119, 34, 0.6);
        }
      `}</style>

      {/* Soft warm wash backdrop — heritage-warm, not dark */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          aria-hidden
          className="m-wash-1 absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(232,119,34,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="m-wash-2 absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(46,64,87,0.12) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="m-wash-1 absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(245,241,232,0.8) 0%, transparent 70%)",
            animationDelay: "4s",
          }}
        />
      </div>

      <TopBar />

      <div className="relative max-w-6xl mx-auto px-6 py-10 sm:py-16 space-y-12">
        {/* Hero */}
        <header className="m-fade space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/60 border border-[#1A1A1A]/10 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#E87722] opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E87722]" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#666]">
              Tuesday · 10:42 AM Mountain
            </span>
          </div>
          <h1 className="font-black text-5xl sm:text-7xl tracking-tight leading-[0.95]">
            <span className="m-shimmer">Morning, Bruce.</span>
            <br />
            <span className="text-[#2E4057]">Three things matter today.</span>
          </h1>
          <p className="text-[#555] max-w-2xl text-lg">
            Coffee&apos;s already in your hand. Here&apos;s what the next two
            hours could actually move.
          </p>
          <div className="flex gap-2 pt-2">
            <button className="m-orange-cta px-5 py-2.5 rounded-full font-bold text-sm text-white">
              Start the day →
            </button>
            <button className="m-card px-5 py-2.5 rounded-full font-bold text-sm text-[#1A1A1A]">
              Ask Buddy
            </button>
          </div>
        </header>

        {/* Stat row */}
        <section
          className="grid sm:grid-cols-3 gap-4 m-fade"
          style={{ animationDelay: "100ms" }}
        >
          <Stat
            icon={<TrendingUp className="w-4 h-4" />}
            value="$48,000"
            label="In pipeline this month"
            tone="orange"
          />
          <Stat
            icon={<CheckSquare className="w-4 h-4" />}
            value="6"
            label="Things on your plate"
            tone="navy"
          />
          <Stat
            icon={<CalendarClock className="w-4 h-4" />}
            value="Thu 2PM"
            label="Next BBS · Impactica"
            tone="ink"
          />
        </section>

        {/* Commitments card */}
        <section
          className="m-card m-fade rounded-2xl p-6 sm:p-8 space-y-4 relative overflow-hidden"
          style={{ animationDelay: "200ms" }}
        >
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 m-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-700 font-bold">
              Live
            </span>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#888]">
              Commitments · all clients
            </p>
            <h2 className="font-black text-3xl tracking-tight text-[#1A1A1A]">
              Your plate, in priority order.
            </h2>
          </div>
          <ul className="space-y-1">
            {COMMITMENTS.map((c, i) => (
              <CommitmentRow key={i} {...c} delay={i * 80} />
            ))}
          </ul>
          <div className="pt-2">
            <button className="m-card inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em] px-4 py-2 rounded-full text-[#1A1A1A]">
              See everything <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </section>

        {/* Empty state + deliverables */}
        <section
          className="grid md:grid-cols-2 gap-4 m-fade"
          style={{ animationDelay: "300ms" }}
        >
          <div className="m-card rounded-2xl p-6 space-y-3 relative overflow-hidden">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#E87722]" />
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#888]">
                Goals · zero in flight
              </p>
            </div>
            <BlueprintIllustration />
            <div>
              <p className="font-black text-2xl tracking-tight text-[#1A1A1A]">
                Blueprint waiting on you.
              </p>
              <p className="text-sm text-[#666] mt-1">
                Set the first goal and everything else — action items,
                deliverables, sessions — gets pointed there.
              </p>
            </div>
            <button className="m-orange-cta inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] px-4 py-2 rounded-full text-white">
              Set the first one <Sparkles className="w-3 h-3" />
            </button>
          </div>

          <div className="m-card rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#2E4057]" />
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#888]">
                Deliverables · 3 in flight
              </p>
            </div>
            <div className="space-y-2">
              {DELIVERABLES.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#F5F1E8] transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl m-orange-cta flex items-center justify-center font-mono text-[10px] font-black text-white">
                    {d.initials}
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

        {/* Buddy AI moment */}
        <section
          className="m-card m-fade rounded-2xl p-5 relative overflow-hidden"
          style={{ animationDelay: "400ms" }}
        >
          <div className="flex items-start gap-4">
            <div className="m-float relative flex-none">
              <div className="w-14 h-14 rounded-full m-orange-cta flex items-center justify-center">
                <Hammer className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#E87722]">
                  Buddy · thinking
                </p>
                <Zap className="w-3 h-3 text-[#E87722]" />
              </div>
              <p className="text-[#1A1A1A] font-bold text-lg">
                Three action items are 24 hours from going overdue. Want me
                to draft a nudge to the assignees?
              </p>
              <p className="text-[#666] text-sm mt-1">
                I&apos;ll match your voice. You review before send.
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                <button className="m-orange-cta text-xs font-bold uppercase tracking-[0.18em] px-4 py-1.5 rounded-full text-white">
                  Yes, draft it
                </button>
                <button className="m-card text-xs font-bold uppercase tracking-[0.18em] px-4 py-1.5 rounded-full text-[#1A1A1A]">
                  Not yet
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section
          className="m-fade text-center py-8 space-y-3"
          style={{ animationDelay: "500ms" }}
        >
          <Star className="w-8 h-8 text-[#E87722] mx-auto m-float" />
          <p className="font-black text-3xl tracking-tight">
            <span className="m-shimmer">Build what compounds.</span>
          </p>
          <p className="text-[#666] text-sm max-w-md mx-auto">
            Heritage soul. Modern product polish. The colours and methodology
            you picked, with energy that actually feels alive.
          </p>
        </section>

        <Footer />
      </div>
    </main>
  );
}

function TopBar() {
  return (
    <div className="relative border-b border-[#1A1A1A]/8 bg-[#FAFAF7]/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/mockups"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666] hover:text-[#1A1A1A]"
        >
          ← Back to mockup picker
        </Link>
        <p className="font-black tracking-tight">
          <span className="m-shimmer">The Builder</span>
          <span className="text-[#666]"> · Middle path</span>
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#E87722]">
          B + C blend
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
    <div className="m-card rounded-2xl p-5 space-y-1">
      <div className={`flex items-center gap-2 ${toneClass}`}>
        {icon}
        <p className="font-mono text-[10px] uppercase tracking-[0.22em]">
          {label}
        </p>
      </div>
      <p
        className={`font-black text-3xl tracking-tight tabular-nums transition-all duration-700 ${toneClass}`}
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
        ? "bg-[#E87722]/15 text-[#E87722] border-[#E87722]/30"
        : "bg-emerald-50 text-emerald-700 border-emerald-300";
  return (
    <li
      className="m-fade flex items-baseline gap-3 px-3 py-2 rounded-xl hover:bg-[#F5F1E8] cursor-pointer transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`text-[9px] font-mono font-black uppercase tracking-[0.22em] px-1.5 py-0.5 rounded border ${kindClass}`}
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
  return (
    <div className="m-float h-32 flex items-center justify-center bg-[#F5F1E8] rounded-xl border border-[#1A1A1A]/8 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(232,119,34,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(46,64,87,0.3) 0%, transparent 50%)",
        }}
      />
      <svg
        viewBox="0 0 200 100"
        className="w-3/4 h-full relative"
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
    <div className="border-t border-[#1A1A1A]/8 pt-6 mt-12 flex items-center justify-between flex-wrap gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#888]">
        The Builder · By Workplaces
      </p>
      <div className="flex gap-3 text-[11px] text-[#666]">
        <Link href="/mockups" className="hover:text-[#1A1A1A]">
          ← All mockups
        </Link>
        <Link href="/mockups/b" className="hover:text-[#1A1A1A]">
          Compare to B
        </Link>
        <Link href="/mockups/c" className="hover:text-[#1A1A1A]">
          Compare to C →
        </Link>
      </div>
    </div>
  );
}

// Reserved for future iterations.
void CheckCircle2;
