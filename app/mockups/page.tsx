import Link from "next/link";

/**
 * Mockup hub — two side-by-side previews of where the UI could go.
 * No auth, no DB. Bruce visits in his browser to compare A/B/C.
 */
export default function MockupsHub() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-tbb-ink-3">
          UI direction · pick one
        </p>
        <h1 className="font-black text-tbb-navy text-4xl tracking-tight">
          Two mockups, side by side.
        </h1>
        <p className="text-tbb-ink-2">
          Same content (your home dashboard) shown two different ways.
          Click into each, scroll the page, hover the cards, then come
          back here and tell me which one ships.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link
          href="/mockups/b"
          className="group block border border-tbb-line rounded-lg bg-white p-6 hover:border-tbb-blue hover:shadow-lg transition-all"
        >
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue mb-2">
            Option B
          </p>
          <h2 className="font-black text-tbb-navy text-2xl tracking-tight mb-2">
            Heritage + motion
          </h2>
          <p className="text-sm text-tbb-ink-2 mb-4">
            Same brand palette. Cards lift on hover, hero illustrations
            on empty states. Less ledger, more product.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue group-hover:underline">
            Open B →
          </span>
        </Link>

        <Link
          href="/mockups/refined"
          className="group block border-2 border-[#E87722] rounded-lg bg-white p-6 hover:shadow-lg transition-all relative"
        >
          <span className="absolute -top-2 left-4 text-[9px] font-bold uppercase tracking-tbb-caps bg-[#E87722] text-white px-2 py-0.5 rounded">
            ← Your latest ask
          </span>
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue mb-2">
            Refined
          </p>
          <h2 className="font-black text-tbb-navy text-2xl tracking-tight mb-2">
            Live app + B motion
          </h2>
          <p className="text-sm text-tbb-ink-2 mb-4">
            Structure and formality of what we have today (sidebar,
            cards, heritage palette) — with B&apos;s motion: hover lift,
            counters, pulse-ring, drifting mascot, blueprint empty
            state. <strong>No text shimmer.</strong>
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue group-hover:underline">
            Open refined →
          </span>
        </Link>

        <Link
          href="/mockups/middle"
          className="group block border-2 border-tbb-blue rounded-lg bg-white p-6 hover:shadow-lg transition-all relative"
        >
          <span className="absolute -top-2 left-4 text-[9px] font-bold uppercase tracking-tbb-caps bg-tbb-blue text-white px-2 py-0.5 rounded">
            ← You asked for this
          </span>
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue mb-2">
            Middle path
          </p>
          <h2 className="font-black text-tbb-navy text-2xl tracking-tight mb-2">
            B + C blend
          </h2>
          <p className="text-sm text-tbb-ink-2 mb-4">
            Heritage colours kept (orange + steel blue + cream) but with
            modern motion: soft warm wash backdrop, glass cards, shimmer
            headline, glowing CTAs. Bright, alive.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue group-hover:underline">
            Open middle →
          </span>
        </Link>

        <Link
          href="/mockups/c"
          className="group block border border-tbb-line rounded-lg bg-white p-6 hover:border-tbb-blue hover:shadow-lg transition-all"
        >
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue mb-2">
            Option C
          </p>
          <h2 className="font-black text-tbb-navy text-2xl tracking-tight mb-2">
            Real brand pivot
          </h2>
          <p className="text-sm text-tbb-ink-2 mb-4">
            Drop heritage. Dark canvas, animated gradient mesh, glass
            cards, electric coral. Reads like Linear or Cursor.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue group-hover:underline">
            Open C →
          </span>
        </Link>

        <Link
          href="/mockups/editorial"
          className="group block border border-tbb-line rounded-lg bg-white p-6 hover:border-tbb-blue hover:shadow-lg transition-all"
          style={{ fontFamily: "Georgia, serif" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-tbb-caps text-tbb-blue mb-2"
            style={{ fontFamily: "var(--font-mono, monospace)" }}>
            Option E
          </p>
          <h2 className="text-tbb-navy text-2xl tracking-tight mb-2 italic">
            <span className="font-black not-italic">Editorial</span> — a
            confident publication.
          </h2>
          <p className="text-sm text-tbb-ink-2 mb-4">
            Different axis. Big serif display type, generous whitespace,
            pull-quotes, oversized numbers. Reads like Stratechery or
            the New Yorker — authority without animation.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue group-hover:underline"
            style={{ fontFamily: "var(--font-mono, monospace)" }}>
            Open editorial →
          </span>
        </Link>
      </div>

      <div className="border-t border-tbb-line-soft pt-6 space-y-2 text-sm text-tbb-ink-3">
        <p>
          <strong className="text-tbb-navy">Reminder — Option A</strong>{" "}
          (stay heritage + more delight moments) is what you have today
          plus more confetti / Buddy reactions on milestones. The current
          app at <Link href="/coach" className="text-tbb-blue underline">/coach</Link>{" "}
          is the Option A baseline.
        </p>
        <p>
          These mockups are static — no data, no clicking through to
          real features. Just look-and-feel.
        </p>
      </div>
    </main>
  );
}
