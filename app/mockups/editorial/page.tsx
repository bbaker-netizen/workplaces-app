"use client";

/**
 * Option E — Editorial.
 *
 * A completely different axis from B / Middle / C. Where the others
 * lean industrial / product / AI-app, this one borrows from
 * publications: Stratechery, The Atlantic, NYT Magazine. Big serif
 * display type, generous whitespace, pull-quotes, restrained
 * animation, oversized numbers as pure typography. Reads like a
 * coaching practice that takes itself seriously without the heritage
 * industrial vibe.
 *
 * Confidence > motion. Authority > novelty.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarClock,
  CheckSquare,
  FileText,
  Hammer,
  Quote,
  Target,
  TrendingUp,
} from "lucide-react";

export default function MockupEditorial() {
  return (
    <main className="min-h-screen bg-[#FBFAF5] text-[#191919]">
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..900;1,8..60,300..900&display=swap");

        @keyframes e-rise {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes e-underline {
          from {
            width: 0;
          }
          to {
            width: 100%;
          }
        }
        .e-serif {
          font-family:
            "Source Serif 4",
            "Iowan Old Style",
            "Apple Garamond",
            "Baskerville",
            Georgia,
            serif;
        }
        .e-rise {
          animation: e-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .e-divider {
          height: 1px;
          background: #191919;
        }
        .e-rule-thin {
          height: 1px;
          background: rgba(25, 25, 25, 0.15);
        }
        .e-link-underline {
          position: relative;
          display: inline-block;
        }
        .e-link-underline::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: -2px;
          height: 1px;
          background: #191919;
          width: 100%;
          transform-origin: left;
          transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .e-link-underline:hover::after {
          transform: scaleX(0);
          transform-origin: right;
        }
        .e-card {
          background: #ffffff;
          border-top: 2px solid #191919;
          transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .e-card:hover {
          transform: translateY(-2px);
        }
        .e-dropcap::first-letter {
          font-family: inherit;
          float: left;
          font-size: 3.6rem;
          line-height: 0.9;
          padding-right: 0.4rem;
          padding-top: 0.4rem;
          font-weight: 900;
          color: #191919;
        }
        .e-pullquote {
          border-left: 3px solid #191919;
        }
      `}</style>

      <Masthead />

      <div className="max-w-3xl mx-auto px-6 py-14 sm:py-20 space-y-16">
        {/* Hero / lede */}
        <header className="e-rise space-y-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#888]">
            Volume 1 · Issue 12 · Tuesday, May 16
          </p>
          <h1 className="e-serif text-[#191919] text-5xl sm:text-7xl font-black tracking-tight leading-[0.95]">
            Good morning, Bruce.
            <br />
            <span className="italic font-light text-[#666]">
              Three things matter today.
            </span>
          </h1>
          <p className="e-serif text-xl sm:text-2xl leading-relaxed text-[#444] font-light">
            Coffee is already in your hand. Here is what the next two hours
            could actually move — drawn from forty-six open commitments
            across every active engagement.
          </p>
          <div className="e-rule-thin w-32" />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
            Compiled by The Builder · 10:42 AM Mountain
          </p>
        </header>

        {/* Big number / pull-stat */}
        <section className="e-rise grid sm:grid-cols-3 gap-8" style={{ animationDelay: "120ms" }}>
          <NumberStat
            value="$48,000"
            label="Pipeline this month"
            note="Across 11 active prospects"
          />
          <NumberStat
            value="6"
            label="Things on your plate"
            note="Action items, deliverables, goals"
          />
          <NumberStat
            value="Thu 2 PM"
            label="Next session"
            note="Impactica · in-person at the office"
          />
        </section>

        <div className="e-divider w-full" />

        {/* Lead story — commitments */}
        <section className="e-rise space-y-6" style={{ animationDelay: "200ms" }}>
          <header className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#888]">
              Lead story
            </p>
            <h2 className="e-serif text-4xl sm:text-5xl font-black tracking-tight leading-[1]">
              The plate, in priority order.
            </h2>
            <p className="e-serif text-lg italic text-[#666]">
              Six commitments rising to the top of the stack — sorted by
              what gets cold first.
            </p>
          </header>

          <ul className="divide-y divide-[#191919]/15">
            {COMMITMENTS.map((c, i) => (
              <CommitmentLi key={i} {...c} index={i + 1} />
            ))}
          </ul>

          <Link
            href="#"
            className="e-link-underline e-serif text-lg italic text-[#191919] inline-flex items-center gap-1"
          >
            Read every open commitment <ArrowRight className="w-4 h-4" />
          </Link>
        </section>

        {/* Pull quote — Buddy as commentary */}
        <section
          className="e-rise e-pullquote pl-6 py-2 space-y-3"
          style={{ animationDelay: "300ms" }}
        >
          <Quote className="w-6 h-6 text-[#191919]/30" aria-hidden />
          <p className="e-serif text-2xl sm:text-3xl font-light leading-tight text-[#191919]">
            &ldquo;Three action items are 24 hours from going overdue. I can
            draft a nudge in your voice — you review before send.&rdquo;
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#888]">
            — Builder Buddy, your in-app assistant
          </p>
          <div className="pt-2 flex gap-3">
            <button className="bg-[#191919] text-white px-5 py-2 text-sm font-bold tracking-wide hover:bg-[#000]">
              Draft the nudge
            </button>
            <button className="e-link-underline e-serif italic text-[#191919] text-sm">
              Not yet
            </button>
          </div>
        </section>

        <div className="e-divider w-full" />

        {/* Two-column: deliverables + goal */}
        <section className="e-rise grid md:grid-cols-2 gap-10" style={{ animationDelay: "400ms" }}>
          <article className="space-y-4">
            <header className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#888]">
                In progress · 3 deliverables
              </p>
              <h3 className="e-serif text-2xl font-black tracking-tight">
                Long-form work, mid-stride.
              </h3>
            </header>
            <ul className="space-y-3 e-serif">
              {DELIVERABLES.map((d, i) => (
                <li key={i} className="space-y-1">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[#888] font-mono text-xs tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-bold text-[#191919] text-lg flex-1">
                      {d.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#888]">
                      {d.pct}%
                    </span>
                  </div>
                  <p className="text-sm italic text-[#666] pl-7">
                    {d.engagement}
                  </p>
                  <div className="pl-7">
                    <div className="h-px bg-[#191919]/15 overflow-hidden">
                      <div
                        className="h-px bg-[#191919] transition-all duration-1000"
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article className="space-y-4 e-card -mt-px pt-6 pl-6 pr-6 pb-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#888]">
              Awaiting first goal
            </p>
            <h3 className="e-serif text-2xl font-black tracking-tight">
              A blank page.
            </h3>
            <p className="e-serif text-[#444] leading-relaxed e-dropcap">
              Goals are the destinations every other piece of work points
              toward. None set yet — which means the plate is responsive
              instead of strategic. The first one usually surfaces in the
              second BBS, when the founder names their twelve-month
              picture out loud for the first time.
            </p>
            <button className="bg-[#191919] text-white px-5 py-2 text-sm font-bold tracking-wide hover:bg-[#000] inline-flex items-center gap-2">
              Draft a first goal <Target className="w-3.5 h-3.5" />
            </button>
          </article>
        </section>

        <div className="e-divider w-full" />

        {/* Sidebar-style footer cards */}
        <section className="e-rise grid sm:grid-cols-3 gap-6 pt-2" style={{ animationDelay: "500ms" }}>
          <FooterCard
            kicker="The week ahead"
            title="Two sessions, one proposal."
            body="BlueRiver Tuesday, Impactica Thursday. MillCreek proposal goes out Friday morning."
            cta="See the week"
          />
          <FooterCard
            kicker="Quietly working"
            title="Gmail capture · 47 emails."
            body="Synced into client timelines since Monday. None require your attention."
            cta="Review timeline"
          />
          <FooterCard
            kicker="Subscriptions"
            title="$3,840 / mo run-rate."
            body="14 client services maintained. Two pending transfer."
            cta="Open inventory"
          />
        </section>

        {/* Closing colophon */}
        <section className="e-rise text-center py-12 space-y-3" style={{ animationDelay: "600ms" }}>
          <Hammer className="w-6 h-6 text-[#191919] mx-auto" />
          <p className="e-serif italic text-2xl text-[#191919]">
            Build what compounds.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#888]">
            The Builder · By Workplaces · No. 12
          </p>
        </section>

        <Footer />
      </div>
    </main>
  );
}

function Masthead() {
  return (
    <header className="border-b border-[#191919] bg-[#FBFAF5]">
      <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
        <Link
          href="/mockups"
          className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#666] hover:text-[#191919]"
        >
          ← Mockups
        </Link>
        <p className="e-serif italic text-[#191919] text-sm">
          The Builder
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#191919]">
          Editorial
        </span>
      </div>
    </header>
  );
}

function NumberStat({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note: string;
}) {
  const [shown, setShown] = useState("0");
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 250);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="space-y-2 border-t border-[#191919] pt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#888]">
        {label}
      </p>
      <p className="e-serif text-4xl sm:text-5xl font-black tracking-tight text-[#191919] tabular-nums transition-all duration-700">
        {shown}
      </p>
      <p className="e-serif italic text-sm text-[#666]">{note}</p>
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

function CommitmentLi({
  kind,
  title,
  eng,
  due,
  overdue,
  index,
}: {
  kind: string;
  title: string;
  eng: string;
  due: string;
  overdue: boolean;
  index: number;
}) {
  return (
    <li className="py-4 flex items-baseline gap-4 group">
      <span className="font-mono text-xs text-[#888] tabular-nums w-8">
        {String(index).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#888]">
          {kind} · {eng}
        </p>
        <p className="e-serif text-xl text-[#191919] leading-snug group-hover:italic transition-all">
          {title}
        </p>
      </div>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
          overdue ? "text-[#191919] font-bold border-b border-[#191919]" : "text-[#888]"
        }`}
      >
        {overdue ? "Overdue · " : "Due "}
        {due}
      </span>
    </li>
  );
}

const DELIVERABLES = [
  {
    title: "SOP for the onboarding flow.",
    engagement: "Acme Inc",
    pct: 80,
  },
  {
    title: "Financial dashboard v3.",
    engagement: "Impactica",
    pct: 55,
  },
  {
    title: "Hiring guide for site foremen.",
    engagement: "BlueRiver Construction",
    pct: 30,
  },
];

function FooterCard({
  kicker,
  title,
  body,
  cta,
}: {
  kicker: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <article className="space-y-2 border-t border-[#191919] pt-3 e-card">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#888]">
        {kicker}
      </p>
      <h4 className="e-serif text-xl font-bold text-[#191919] leading-tight">
        {title}
      </h4>
      <p className="e-serif text-sm text-[#666] leading-relaxed">{body}</p>
      <Link
        href="#"
        className="e-link-underline e-serif italic text-sm text-[#191919] inline-flex items-center gap-1"
      >
        {cta} <ArrowUpRight className="w-3 h-3" />
      </Link>
    </article>
  );
}

function Footer() {
  return (
    <div className="border-t border-[#191919] pt-6 mt-12 flex items-center justify-between flex-wrap gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#888]">
        The Builder · By Workplaces · Bruce Baker, editor
      </p>
      <div className="flex gap-4 text-[11px]">
        <Link href="/mockups" className="e-link-underline e-serif italic text-[#191919]">
          ← All mockups
        </Link>
        <Link href="/mockups/b" className="e-link-underline e-serif italic text-[#191919]">
          B
        </Link>
        <Link href="/mockups/middle" className="e-link-underline e-serif italic text-[#191919]">
          Middle
        </Link>
        <Link href="/mockups/c" className="e-link-underline e-serif italic text-[#191919]">
          C
        </Link>
      </div>
    </div>
  );
}

// Reserved for future iterations.
void TrendingUp;
void CheckSquare;
void CalendarClock;
void FileText;
void Bookmark;
