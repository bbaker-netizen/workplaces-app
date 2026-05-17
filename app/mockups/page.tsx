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

      <div className="grid sm:grid-cols-2 gap-4">
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
            Same brand palette (Drafting Cream / Foreman Black / Safety
            Vest Orange / Steel Blue). Cards lift on hover, hero
            illustrations on empty states, micro-interactions everywhere.
            Less ledger, more product.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue group-hover:underline">
            Open mockup B →
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
            Drop heritage entirely. Modern AI-coach aesthetic — animated
            gradient backdrop, glass cards, electric accents, bold
            typography. Reads like Linear or Cursor, not a ledger.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-tbb-caps text-tbb-blue group-hover:underline">
            Open mockup C →
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
