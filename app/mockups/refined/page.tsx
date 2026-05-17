"use client";

/**
 * Refined — the live app's structure + B's motion, no shimmer.
 *
 * Bruce's brief:
 *  - Keep the formality of what we already have (heritage palette,
 *    structured dashboard cards, sidebar feel).
 *  - Add B's liveliness (hover lift, drift on the mascot, animated
 *    counters, blueprint illustration on empty states, pulse-ring on
 *    Live indicators, subtle fade-in on load).
 *  - No shimmer text. No colour-fading headlines. Animation has to
 *    feel intentional, not decorative.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckSquare,
  ExternalLink,
  FileText,
  Filter,
  Hammer,
  Home,
  Inbox,
  MessagesSquare,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export default function MockupRefined() {
  return (
    <main className="min-h-screen bg-[#F5F1E8] text-[#1A1A1A]">
      <style jsx global>{`
        @keyframes r-rise {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes r-drift {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        @keyframes r-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(232, 119, 34, 0.55);
          }
          70% {
            box-shadow: 0 0 0 9px rgba(232, 119, 34, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(232, 119, 34, 0);
          }
        }
        .r-rise {
          animation: r-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .r-drift {
          animation: r-drift 4.5s ease-in-out infinite;
        }
        .r-pulse {
          animation: r-pulse 2.4s ease-out infinite;
        }
        .r-card {
          background: #ffffff;
          border: 1px solid rgba(26, 26, 26, 0.08);
          transition:
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 220ms ease;
        }
        .r-card:hover {
          transform: translateY(-2px);
          border-color: #2e4057;
          box-shadow: 0 12px 28px -14px rgba(46, 64, 87, 0.2);
        }
        .r-sidebar-link {
          position: relative;
          transition: background 180ms ease, color 180ms ease;
        }
        .r-sidebar-link:hover {
          background: rgba(46, 64, 87, 0.06);
        }
        .r-sidebar-link.active {
          background: #2e4057;
          color: #ffffff;
        }
        .r-row-hover {
          transition: background 200ms ease;
        }
        .r-row-hover:hover {
          background: #faf7ee;
        }
        .r-btn-orange {
          background: #e87722;
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            background 180ms ease;
        }
        .r-btn-orange:hover {
          background: #d86614;
          transform: translateY(-1px);
          box-shadow: 0 10px 24px -10px rgba(232, 119, 34, 0.55);
        }
        .r-btn-ghost {
          transition: background 180ms ease;
        }
        .r-btn-ghost:hover {
          background: #f5f1e8;
        }
      `}</style>

      <TopBar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-6">
        <Sidebar />

        <section className="flex-1 min-w-0 py-8 sm:py-12 space-y-8">
          {/* Header */}
          <header className="r-rise space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
              Business Builder Console · Tuesday, 10:42 AM Mountain
            </p>
            <h1 className="font-black text-[#1A1A1A] text-4xl sm:text-5xl tracking-tight leading-tight">
              Good morning, Bruce.
            </h1>
            <p className="text-[#555] text-base sm:text-lg max-w-2xl">
              Three things matter today. Here&apos;s your plate, in priority
              order — and what&apos;s quietly running in the background.
            </p>
          </header>

          {/* Stat row */}
          <section
            className="r-rise grid grid-cols-1 sm:grid-cols-3 gap-3"
            style={{ animationDelay: "60ms" }}
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
              value="Thu 2 PM"
              label="Next BBS · Impactica"
              tone="ink"
            />
          </section>

          {/* Two columns: Commitments + Pipeline */}
          <section
            className="r-rise grid grid-cols-1 lg:grid-cols-3 gap-4"
            style={{ animationDelay: "120ms" }}
          >
            {/* Commitments (large) */}
            <article className="r-card rounded-lg p-5 lg:col-span-2 space-y-3 relative">
              <header className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#2E4057]" />
                <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
                  Commitments · all clients
                </h2>
                <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 r-pulse" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-700 font-bold">
                    Live
                  </span>
                </div>
              </header>
              <h3 className="font-black text-[#1A1A1A] text-xl tracking-tight">
                Your plate, in priority order.
              </h3>
              <ul className="divide-y divide-[#1A1A1A]/8">
                {COMMITMENTS.map((c, i) => (
                  <CommitmentRow key={i} {...c} delay={i * 60} />
                ))}
              </ul>
              <div className="pt-1">
                <Link
                  href="#"
                  className="r-btn-ghost inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-md text-[#2E4057]"
                >
                  See everything <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </article>

            {/* Pipeline snapshot (small) */}
            <article className="r-card rounded-lg p-5 space-y-3">
              <header className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#2E4057]" />
                <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
                  Pipeline · this month
                </h2>
              </header>
              <ul className="space-y-2">
                {PIPELINE.map((p, i) => (
                  <li
                    key={i}
                    className="r-row-hover flex items-center gap-2 -mx-1 px-1 py-1 rounded"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E87722]" />
                    <span className="text-sm font-bold text-[#1A1A1A] truncate flex-1">
                      {p.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666]">
                      {p.stage}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="pt-1 border-t border-[#1A1A1A]/8">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#888]">
                  3 new this week · 1 negotiating
                </p>
              </div>
            </article>
          </section>

          {/* Deliverables row + Goals empty state */}
          <section
            className="r-rise grid grid-cols-1 lg:grid-cols-3 gap-4"
            style={{ animationDelay: "180ms" }}
          >
            <article className="r-card rounded-lg p-5 lg:col-span-2 space-y-3">
              <header className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#2E4057]" />
                <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
                  Deliverables · in flight
                </h2>
                <span className="ml-auto font-mono text-[10px] text-[#888]">3</span>
              </header>
              <ul className="space-y-2">
                {DELIVERABLES.map((d, i) => (
                  <li
                    key={i}
                    className="r-row-hover flex items-center gap-3 -mx-2 px-2 py-2 rounded"
                  >
                    <div className="w-8 h-8 rounded-md bg-[#F5F1E8] border border-[#1A1A1A]/10 flex items-center justify-center">
                      <span className="font-mono text-[9px] font-black text-[#2E4057]">
                        {d.initials}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#1A1A1A] text-sm truncate">
                        {d.title}
                      </p>
                      <p className="text-[11px] text-[#666]">
                        {d.engagement}
                      </p>
                    </div>
                    <div className="w-16 h-1.5 rounded-full bg-[#F5F1E8] overflow-hidden">
                      <div
                        className="h-full bg-[#2E4057] transition-all duration-1000"
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#888] w-8 text-right tabular-nums">
                      {d.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="r-card rounded-lg p-5 space-y-3">
              <header className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#E87722]" />
                <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
                  Goals · 0 in flight
                </h2>
              </header>
              <BlueprintIllustration />
              <p className="font-bold text-[#1A1A1A] text-sm">
                Blueprint waiting on you.
              </p>
              <p className="text-xs text-[#666]">
                Set the first goal and everything else gets pointed there.
              </p>
              <button className="r-btn-orange inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-md text-white">
                Set the first <ArrowRight className="w-3 h-3" />
              </button>
            </article>
          </section>

          {/* Buddy assistant suggestion */}
          <section
            className="r-rise r-card rounded-lg p-5"
            style={{ animationDelay: "240ms" }}
          >
            <div className="flex items-start gap-4">
              <div className="r-drift flex-none relative">
                <div className="w-12 h-12 rounded-md bg-[#E87722] text-white flex items-center justify-center shadow-[0_8px_18px_-6px_rgba(232,119,34,0.45)]">
                  <Hammer className="w-5 h-5" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#E87722] font-bold">
                    Buddy
                  </p>
                  <Zap className="w-3 h-3 text-[#E87722]" />
                </div>
                <p className="text-[#1A1A1A] font-bold mt-0.5">
                  Three action items are 24 hours from going overdue.
                </p>
                <p className="text-sm text-[#666] mt-0.5">
                  Want me to draft a nudge to the assignees? I&apos;ll match
                  your voice. You review before send.
                </p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <button className="r-btn-orange text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-md text-white">
                    Yes, draft it
                  </button>
                  <button className="r-btn-ghost text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-md text-[#666]">
                    Not yet
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Quietly running */}
          <section
            className="r-rise grid grid-cols-1 sm:grid-cols-3 gap-3"
            style={{ animationDelay: "300ms" }}
          >
            <QuietCard
              icon={<Inbox className="w-4 h-4 text-[#2E4057]" />}
              title="47 emails captured"
              note="Synced from Gmail since Monday. Nothing needs you."
              href="#"
            />
            <QuietCard
              icon={<MessagesSquare className="w-4 h-4 text-[#2E4057]" />}
              title="2 client threads"
              note="Both read. No replies pending."
              href="#"
            />
            <QuietCard
              icon={<Sparkles className="w-4 h-4 text-[#2E4057]" />}
              title="Soul File search ready"
              note="3 engagements indexed for cross-client queries."
              href="#"
            />
          </section>

          <Footer />
        </section>
      </div>
    </main>
  );
}

/* --------------------------- chrome --------------------------- */

function TopBar() {
  return (
    <div className="border-b border-[#1A1A1A]/10 bg-[#F5F1E8]/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-6">
        <Link
          href="/mockups"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#666] hover:text-[#1A1A1A]"
        >
          ← Mockups
        </Link>
        <p className="font-black text-[#1A1A1A] tracking-tight text-sm">
          The Builder
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
          By Workplaces
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-[#E87722]">
          Refined · live structure + B motion
        </span>
      </div>
    </div>
  );
}

function Sidebar() {
  const items: {
    label: string;
    href: string;
    icon: React.ReactNode;
    active?: boolean;
  }[] = [
    { label: "Console", href: "#", icon: <Home className="w-4 h-4" />, active: true },
    { label: "Pipeline", href: "#", icon: <Filter className="w-4 h-4" /> },
    { label: "Action items", href: "#", icon: <CheckSquare className="w-4 h-4" /> },
    { label: "Sessions", href: "#", icon: <CalendarClock className="w-4 h-4" /> },
    { label: "Deliverables", href: "#", icon: <FileText className="w-4 h-4" /> },
    { label: "Goals", href: "#", icon: <Target className="w-4 h-4" /> },
    { label: "Team", href: "#", icon: <Users className="w-4 h-4" /> },
    { label: "Inbox", href: "#", icon: <Inbox className="w-4 h-4" /> },
    { label: "Settings", href: "#", icon: <Settings className="w-4 h-4" /> },
  ];
  return (
    <aside className="hidden lg:block w-52 flex-none border-r border-[#1A1A1A]/10 min-h-screen pt-8 pr-4">
      <nav className="space-y-0.5">
        {items.map((it, i) => (
          <Link
            key={i}
            href={it.href}
            className={`r-sidebar-link flex items-center gap-2.5 px-3 py-1.5 rounded text-sm font-bold ${
              it.active ? "active text-white" : "text-[#1A1A1A]"
            }`}
          >
            {it.icon}
            <span>{it.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-8 px-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#888] mb-2">
          Engagements
        </p>
        <ul className="space-y-1 text-sm">
          {["Acme Inc", "Impactica", "BlueRiver", "MillCreek"].map((e) => (
            <li key={e}>
              <Link
                href="#"
                className="r-row-hover block px-3 py-1 rounded text-[#1A1A1A]"
              >
                {e}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/* --------------------------- cards --------------------------- */

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
    const t = setTimeout(() => setShown(value), 180);
    return () => clearTimeout(t);
  }, [value]);
  const toneClass =
    tone === "orange"
      ? "text-[#E87722]"
      : tone === "navy"
        ? "text-[#2E4057]"
        : "text-[#1A1A1A]";
  return (
    <div className="r-card rounded-lg p-4 space-y-1">
      <div className={`flex items-center gap-2 ${toneClass}`}>
        {icon}
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]">
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
      className="r-rise r-row-hover flex items-baseline gap-3 -mx-2 px-2 py-2 rounded cursor-pointer"
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

const PIPELINE = [
  { name: "Acme Inc — Mike", stage: "Negotiating" },
  { name: "MillCreek Trades", stage: "Proposal sent" },
  { name: "Atlas Roofing", stage: "Diagnostic" },
  { name: "Northstar Logistics", stage: "First contact" },
];

const DELIVERABLES = [
  { title: "SOP — Onboarding flow", engagement: "Acme Inc", initials: "SOP", pct: 80 },
  { title: "Financial dashboard v3", engagement: "Impactica", initials: "FIN", pct: 55 },
  { title: "Hiring guide — site foremen", engagement: "BlueRiver", initials: "HG", pct: 30 },
];

function BlueprintIllustration() {
  return (
    <div className="r-drift h-24 flex items-center justify-center bg-[#F5F1E8] rounded-md border border-[#1A1A1A]/10">
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

function QuietCard({
  icon,
  title,
  note,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  href: string;
}) {
  return (
    <Link href={href} className="r-card rounded-lg p-4 space-y-1 block group">
      <div className="flex items-center gap-2">
        {icon}
        <p className="font-bold text-[#1A1A1A] text-sm flex-1">{title}</p>
        <ExternalLink className="w-3 h-3 text-[#888] group-hover:text-[#2E4057] transition-colors" />
      </div>
      <p className="text-xs text-[#666] leading-snug">{note}</p>
    </Link>
  );
}

function Footer() {
  return (
    <div className="border-t border-[#1A1A1A]/10 pt-5 mt-8 flex items-center justify-between flex-wrap gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
        The Builder · By Workplaces
      </p>
      <div className="flex gap-3 text-[11px] text-[#666]">
        <Link href="/mockups" className="hover:text-[#1A1A1A]">
          ← Picker
        </Link>
        <Link href="/mockups/b" className="hover:text-[#1A1A1A]">
          B
        </Link>
        <Link href="/mockups/middle" className="hover:text-[#1A1A1A]">
          Middle
        </Link>
        <Link href="/mockups/c" className="hover:text-[#1A1A1A]">
          C
        </Link>
        <Link href="/mockups/editorial" className="hover:text-[#1A1A1A]">
          Editorial
        </Link>
      </div>
    </div>
  );
}

// Reserved for future iterations.
void ArrowUpRight;
