"use client";

/**
 * Builder Buddy — a tiny construction-worker mascot that sits in the
 * bottom-right corner of the Business Builder Console. Click them and
 * they pop a speech bubble with a contextual tip for whatever page
 * you're on. Tasteful homage to the old Office Assistant — friendly,
 * idle by default, never interrupts.
 *
 * UX rules:
 *   - Sleeps quietly until clicked (no popups, no auto-trigger).
 *   - Idle animation: gentle bob + occasional hat tip.
 *   - Speech bubble closes on click-outside or via "Got it".
 *   - "Hide on this page" stores a dismissal in localStorage per path.
 *   - Mute toggle stores a global "don't show me Buddy anywhere" flag.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_GLOBAL_KEY = "tbb_buddy_muted";
const STORAGE_PATH_KEY = "tbb_buddy_hidden_paths";

type Tip = {
  emoji?: string;
  text: string;
};

/**
 * Page-aware tips. Match in priority order — most-specific first.
 * Each path can have multiple tips; clicking "Next tip" cycles.
 */
const TIPS: { match: (p: string) => boolean; tips: Tip[] }[] = [
  {
    match: (p) => /^\/coach\/pipeline\/[^/]+$/.test(p) && p !== "/coach/pipeline/new",
    tips: [
      { emoji: "👋", text: "Read the What's Next card up top — it tells you exactly what to do at this stage." },
      { emoji: "📅", text: "Quick Actions has Schedule Meeting AND Send Diagnostic. Save typing — let the app email them for you." },
      { emoji: "📝", text: "The Communications panel at the bottom is the per-client audit trail. Email, SMS, call notes — all in one feed." },
      { emoji: "🎯", text: "Set a Next Action date on the Deal card so the prospect surfaces in the list when it's time to follow up." },
    ],
  },
  {
    match: (p) => p === "/coach/pipeline" || p === "/coach/pipeline/new",
    tips: [
      { emoji: "🎯", text: "Pipeline is your sales radar. New leads at the top, won deals at the bottom — work it left to right." },
      { emoji: "🪛", text: "Hit the Columns button to add / hide / resize. Make the table show exactly what you care about." },
      { emoji: "✉️", text: "Web form leads land here automatically. Set up your form to POST to /api/leads — see the Welcome guide." },
    ],
  },
  {
    match: (p) => p === "/coach/inbox",
    tips: [
      { emoji: "📬", text: "This is every email + text across every prospect, in one place. The per-client copies live inside each prospect page." },
      { emoji: "🔍", text: "Use the search bar — it scans subjects, bodies, and senders. Way faster than scrolling." },
      { emoji: "🏷️", text: "Tag conversations to filter later. 'Renewal', 'Hot', 'Cold' — whatever your brain wants to group by." },
    ],
  },
  {
    match: (p) => p === "/coach/action-items" || p.startsWith("/coach/action-items/"),
    tips: [
      { emoji: "⏱️", text: "Action items = things measured in HOURS or DAYS. If it's measured in weeks, it's a Deliverable." },
      { emoji: "🤖", text: "These get drafted by AI from Fireflies transcripts. Edit, assign, hit Publish, done." },
      { emoji: "🔥", text: "Overdue items pin to the top. Don't ignore them — they're how clients lose trust." },
    ],
  },
  {
    match: (p) => p === "/coach/deliverables" || p.startsWith("/coach/deliverables/"),
    tips: [
      { emoji: "📚", text: "Deliverables = the BIG artifacts. The 9 types: SOPs, Org Charts, Job Profiles, Financials, etc." },
      { emoji: "🏗️", text: "Each deliverable has a lifecycle — Not started → In progress → Review → Done. Tracks billable work." },
    ],
  },
  {
    match: (p) => p === "/coach" || p.startsWith("/coach/communication"),
    tips: [
      { emoji: "👋", text: "Welcome to the console. Hit Customize on the dashboard to rearrange the cards how you like." },
      { emoji: "📌", text: "Hover any sidebar item and hit the star to pin it to Favourites." },
      { emoji: "👀", text: "Click Client Portal View top-right to see what your clients see when they log in." },
    ],
  },
  {
    match: () => true, // fallback for any other coach page
    tips: [
      { emoji: "👷", text: "I'm Buddy. Click me on any page for a quick tip." },
      { emoji: "🦉", text: "The sidebar groups your work by phase: Pipeline → Engage → Deliver → Bill → Practice." },
    ],
  },
];

export function BuilderBuddy() {
  const pathname = usePathname();
  const [muted, setMuted] = useState<boolean>(false);
  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [waved, setWaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load dismissal state once on mount.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(STORAGE_GLOBAL_KEY) === "1");
      const raw = localStorage.getItem(STORAGE_PATH_KEY);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        setHiddenPaths(new Set(arr));
      }
    } catch {
      // localStorage unavailable (SSR, private mode) — fall through.
    }
  }, []);

  // Pick the matching tip set for the current path.
  const tips = useMemo(() => {
    const match = TIPS.find((entry) => entry.match(pathname));
    return match?.tips ?? [];
  }, [pathname]);

  // Reset tip index on path change so each new page starts at tip 0.
  useEffect(() => {
    setTipIndex(0);
    setOpen(false);
  }, [pathname]);

  // Close on click-outside.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Wave once when arriving on a new page (only if not hidden / muted).
  useEffect(() => {
    if (muted || hiddenPaths.has(pathname)) return;
    setWaved(true);
    const t = setTimeout(() => setWaved(false), 1500);
    return () => clearTimeout(t);
  }, [pathname, muted, hiddenPaths]);

  if (muted) return null;
  if (hiddenPaths.has(pathname)) return null;
  if (tips.length === 0) return null;

  const tip = tips[tipIndex % tips.length];

  function hideThisPage() {
    const next = new Set(hiddenPaths);
    next.add(pathname);
    setHiddenPaths(next);
    try {
      localStorage.setItem(
        STORAGE_PATH_KEY,
        JSON.stringify(Array.from(next)),
      );
    } catch {
      /* no-op */
    }
    setOpen(false);
  }

  function muteEverywhere() {
    setMuted(true);
    try {
      localStorage.setItem(STORAGE_GLOBAL_KEY, "1");
    } catch {
      /* no-op */
    }
  }

  function nextTip() {
    setTipIndex((i) => (i + 1) % tips.length);
  }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 right-6 z-40 flex items-end gap-2 pointer-events-none"
    >
      {open && (
        <div className="pointer-events-auto bg-white border border-tbb-line rounded-2xl rounded-br-md shadow-tbb-md p-4 max-w-xs space-y-3 origin-bottom-right animate-[buddyPop_180ms_ease-out]">
          <div className="flex items-start gap-2">
            <span className="text-xl leading-none" aria-hidden>
              {tip.emoji ?? "💡"}
            </span>
            <p className="text-sm text-tbb-ink-2 leading-snug">{tip.text}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-tbb-line-soft">
            {tips.length > 1 && (
              <button
                type="button"
                onClick={nextTip}
                className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue hover:underline"
              >
                Next tip →
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-ink-3 hover:text-tbb-navy"
            >
              Got it
            </button>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={hideThisPage}
                title="Don't show on this page"
                className="text-[10px] text-tbb-ink-4 hover:text-tbb-ink-2"
              >
                Hide here
              </button>
              <button
                type="button"
                onClick={muteEverywhere}
                title="Hide Buddy everywhere"
                className="text-[10px] text-tbb-ink-4 hover:text-tbb-ink-2"
              >
                Mute
              </button>
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Builder Buddy tip"
        title="Builder Buddy — click me for a tip"
        className={
          "pointer-events-auto relative grid place-items-center w-14 h-14 rounded-full bg-tbb-navy text-white shadow-tbb-md cursor-pointer transition-transform duration-tbb-base hover:scale-110 " +
          (waved ? "animate-[buddyWave_1.4s_ease-in-out_1]" : "animate-[buddyBob_3s_ease-in-out_infinite]")
        }
      >
        <BuilderSvg />
        <span className="sr-only">Builder Buddy</span>
      </button>
    </div>
  );
}

/**
 * Minimalist construction-worker mascot. Hard hat in the brand's
 * Safety Vest Orange, friendly face, no gender. Pure SVG so it scales
 * crisply at any size.
 */
function BuilderSvg() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="w-10 h-10"
      aria-hidden="true"
      role="img"
    >
      {/* Hard hat — Safety Vest Orange */}
      <ellipse cx="32" cy="24" rx="18" ry="9" fill="#E87722" />
      <rect x="14" y="22" width="36" height="3" rx="1.5" fill="#C45D14" />
      {/* Top button on hat */}
      <circle cx="32" cy="16" r="2.2" fill="#C45D14" />
      {/* Face — warm peach */}
      <ellipse cx="32" cy="34" rx="11" ry="10" fill="#F4C9A7" />
      {/* Eyes */}
      <circle cx="27.5" cy="33" r="1.4" fill="#1A1A1A" />
      <circle cx="36.5" cy="33" r="1.4" fill="#1A1A1A" />
      {/* Smile */}
      <path
        d="M 27 37 Q 32 41 37 37"
        stroke="#1A1A1A"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      {/* Shoulders — Steel Blue */}
      <path d="M 16 50 Q 16 44 24 43 L 40 43 Q 48 44 48 50 L 48 56 L 16 56 Z" fill="#2E4057" />
      {/* Safety stripe */}
      <rect x="16" y="49" width="32" height="2" fill="#E87722" />
    </svg>
  );
}
