"use client";

/**
 * Option C mockup — real brand pivot.
 * Drops heritage entirely. Animated gradient mesh, glass cards,
 * electric coral accent, bold display type, motion on every surface.
 * Reads like Linear / Cursor / modern AI Coach apps.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  FileText,
  Flame,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

export default function MockupC() {
  return (
    <main className="min-h-screen bg-[#0A0E1A] text-white relative overflow-hidden">
      <style jsx global>{`
        @keyframes c-mesh {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(-20px, 20px, 0) scale(1.05);
          }
        }
        @keyframes c-mesh-2 {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(30px, -30px, 0) scale(1.08);
          }
        }
        @keyframes c-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-6px);
          }
        }
        @keyframes c-shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        @keyframes c-fadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes c-pulse-ring {
          0% {
            box-shadow: 0 0 0 0 rgba(255, 92, 79, 0.6);
          }
          70% {
            box-shadow: 0 0 0 12px rgba(255, 92, 79, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(255, 92, 79, 0);
          }
        }
        .c-mesh-1 {
          animation: c-mesh 14s ease-in-out infinite;
        }
        .c-mesh-2 {
          animation: c-mesh-2 16s ease-in-out infinite;
        }
        .c-float {
          animation: c-float 5s ease-in-out infinite;
        }
        .c-fade {
          animation: c-fadeUp 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .c-shimmer-text {
          background: linear-gradient(
            90deg,
            #ffffff 0%,
            #ffffff 40%,
            #ff5c4f 50%,
            #ffffff 60%,
            #ffffff 100%
          );
          background-size: 200% auto;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: c-shimmer 4s linear infinite;
        }
        .c-glass {
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition:
            transform 250ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 250ms ease,
            background 250ms ease;
        }
        .c-glass:hover {
          transform: translateY(-3px);
          border-color: rgba(255, 92, 79, 0.4);
          background: rgba(255, 255, 255, 0.06);
        }
        .c-coral-glow {
          box-shadow: 0 12px 40px -8px rgba(255, 92, 79, 0.5);
        }
        .c-pulse-ring {
          animation: c-pulse-ring 2.4s ease-out infinite;
        }
        .c-coral-bg {
          background: linear-gradient(135deg, #ff5c4f 0%, #ff8a3d 100%);
        }
      `}</style>

      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 opacity-60 pointer-events-none">
        <div
          aria-hidden
          className="c-mesh-1 absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(255,92,79,0.5) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="c-mesh-2 absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="c-mesh-1 absolute bottom-0 left-1/3 w-[500px] h-[500px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(45,212,191,0.35) 0%, transparent 70%)",
            animationDelay: "4s",
          }}
        />
      </div>

      <TopBar />

      <div className="relative max-w-6xl mx-auto px-6 py-10 sm:py-16 space-y-12">
        {/* Hero */}
        <header className="c-fade space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#FF5C4F] opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF5C4F]" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">
              Tuesday · 10:42 AM Mountain
            </span>
          </div>
          <h1 className="font-black text-5xl sm:text-7xl tracking-tight leading-[0.95]">
            <span className="c-shimmer-text">Morning, Bruce.</span>
            <br />
            <span className="text-white/90">
              Three things matter today.
            </span>
          </h1>
          <p className="text-white/60 max-w-2xl text-lg">
            Coffee&apos;s already in your hand. Here&apos;s what the next two
            hours could actually move.
          </p>
          <div className="flex gap-2 pt-2">
            <button className="c-coral-bg c-coral-glow px-5 py-2.5 rounded-full font-bold text-sm hover:scale-[1.02] transition-transform">
              Start the day →
            </button>
            <button className="c-glass px-5 py-2.5 rounded-full font-bold text-sm text-white/80">
              Ask Buddy
            </button>
          </div>
        </header>

        {/* Stat row */}
        <section
          className="grid sm:grid-cols-3 gap-4 c-fade"
          style={{ animationDelay: "100ms" }}
        >
          <Stat
            icon={<TrendingUp className="w-4 h-4" />}
            value="$48,000"
            label="In pipeline this month"
            accent="coral"
          />
          <Stat
            icon={<CheckSquare className="w-4 h-4" />}
            value="6"
            label="Things on your plate"
            accent="indigo"
          />
          <Stat
            icon={<CalendarClock className="w-4 h-4" />}
            value="Thu 2PM"
            label="Next BBS · Impactica"
            accent="teal"
          />
        </section>

        {/* Commitments card */}
        <section
          className="c-glass c-fade rounded-3xl p-6 sm:p-8 space-y-4 relative overflow-hidden"
          style={{ animationDelay: "200ms" }}
        >
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/20 border border-emerald-400/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 c-pulse-ring" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">
              Live
            </span>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
              Commitments · all clients
            </p>
            <h2 className="font-black text-3xl tracking-tight text-white">
              Your plate, in priority order.
            </h2>
          </div>
          <ul className="space-y-1">
            {COMMITMENTS.map((c, i) => (
              <CommitmentRow key={i} {...c} delay={i * 80} />
            ))}
          </ul>
          <div className="pt-2">
            <button className="c-glass inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em] px-4 py-2 rounded-full text-white">
              See everything <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </section>

        {/* Empty state + deliverables */}
        <section
          className="grid md:grid-cols-2 gap-4 c-fade"
          style={{ animationDelay: "300ms" }}
        >
          <div className="c-glass rounded-3xl p-6 space-y-3 relative overflow-hidden">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#FF5C4F]" />
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
                Goals · zero in flight
              </p>
            </div>
            <BlankCanvas />
            <div>
              <p className="font-black text-2xl tracking-tight text-white">
                Blank canvas.
              </p>
              <p className="text-sm text-white/60 mt-1">
                Set the first goal and the AI starts pointing every action
                item, deliverable, and session toward it.
              </p>
            </div>
            <button className="c-coral-bg c-coral-glow inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] px-4 py-2 rounded-full text-white hover:scale-[1.02] transition-transform">
              Set the first one <Sparkles className="w-3 h-3" />
            </button>
          </div>

          <div className="c-glass rounded-3xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-300" />
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
                Deliverables · 3 in flight
              </p>
            </div>
            <div className="space-y-2">
              {DELIVERABLES.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl c-coral-bg flex items-center justify-center font-mono text-[10px] font-black text-white">
                    {d.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm truncate">
                      {d.title}
                    </p>
                    <p className="text-[11px] text-white/40">{d.engagement}</p>
                  </div>
                  <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full c-coral-bg transition-all duration-1000"
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
          className="c-fade rounded-3xl p-5 relative overflow-hidden c-glass"
          style={{ animationDelay: "400ms" }}
        >
          <div className="flex items-start gap-4">
            <div className="c-float relative flex-none">
              <div className="w-14 h-14 rounded-full c-coral-bg c-coral-glow flex items-center justify-center">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#0A0E1A]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#FF5C4F]">
                  Buddy · thinking
                </p>
                <Zap className="w-3 h-3 text-[#FF5C4F]" />
              </div>
              <p className="text-white font-bold text-lg">
                Three action items are 24 hours from going overdue. Want me
                to draft a nudge to the assignees?
              </p>
              <p className="text-white/50 text-sm mt-1">
                I&apos;ll match your voice. You review before send.
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                <button className="c-coral-bg c-coral-glow text-xs font-bold uppercase tracking-[0.18em] px-4 py-1.5 rounded-full text-white">
                  Yes, draft it
                </button>
                <button className="c-glass text-xs font-bold uppercase tracking-[0.18em] px-4 py-1.5 rounded-full text-white/80">
                  Not yet
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section
          className="c-fade text-center py-8 space-y-3"
          style={{ animationDelay: "500ms" }}
        >
          <Star className="w-8 h-8 text-[#FF5C4F] mx-auto c-float" />
          <p className="font-black text-3xl tracking-tight">
            <span className="c-shimmer-text">Build what compounds.</span>
          </p>
          <p className="text-white/50 text-sm max-w-md mx-auto">
            New brand direction. Same methodology underneath. Designed to
            feel like the future of the work, not the past of it.
          </p>
        </section>

        <Footer />
      </div>
    </main>
  );
}

function TopBar() {
  return (
    <div className="relative border-b border-white/5 bg-[#0A0E1A]/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/mockups"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 hover:text-white"
        >
          ← Back to mockup picker
        </Link>
        <p className="font-black tracking-tight">
          <span className="c-shimmer-text">The Builder</span>
          <span className="text-white/40"> · Option C</span>
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#FF5C4F]">
          Brand pivot
        </span>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent: "coral" | "indigo" | "teal";
}) {
  const [shown, setShown] = useState("0");
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 200);
    return () => clearTimeout(t);
  }, [value]);

  const accentMap: Record<string, string> = {
    coral: "text-[#FF5C4F]",
    indigo: "text-indigo-300",
    teal: "text-teal-300",
  };
  return (
    <div className="c-glass rounded-2xl p-5 space-y-1">
      <div className={`flex items-center gap-2 ${accentMap[accent]}`}>
        {icon}
        <p className="font-mono text-[10px] uppercase tracking-[0.22em]">
          {label}
        </p>
      </div>
      <p
        className={`font-black text-3xl tracking-tight tabular-nums transition-all duration-700 ${accentMap[accent]}`}
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
      ? "bg-indigo-400/10 text-indigo-300 border-indigo-400/30"
      : kind === "Deliverable"
        ? "bg-[#FF5C4F]/15 text-[#FF8A3D] border-[#FF5C4F]/30"
        : "bg-teal-400/10 text-teal-300 border-teal-400/30";
  return (
    <li
      className="c-fade flex items-baseline gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`text-[9px] font-mono font-black uppercase tracking-[0.22em] px-1.5 py-0.5 rounded border ${kindClass}`}
      >
        {kind}
      </span>
      <span className="text-sm font-bold text-white">{title}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
        {eng}
      </span>
      <span
        className={`ml-auto font-mono text-[10px] uppercase tracking-[0.18em] ${
          overdue ? "text-[#FF5C4F] font-black" : "text-white/40"
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

function BlankCanvas() {
  return (
    <div className="h-32 flex items-center justify-center bg-white/[0.02] rounded-2xl border border-white/5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(255,92,79,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(99,102,241,0.3) 0%, transparent 50%)",
          }}
        />
      </div>
      <Target className="w-12 h-12 text-white/30 relative" />
    </div>
  );
}

function Footer() {
  return (
    <div className="border-t border-white/5 pt-6 mt-12 flex items-center justify-between flex-wrap gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">
        The Builder · By Workplaces
      </p>
      <div className="flex gap-3 text-[11px] text-white/40">
        <Link href="/mockups" className="hover:text-white">
          ← All mockups
        </Link>
        <Link href="/mockups/b" className="hover:text-white">
          Compare to Option B →
        </Link>
      </div>
    </div>
  );
}

// Silence unused-import warnings for icons reserved for future iterations.
void CheckCircle2;
