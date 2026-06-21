import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-tbb-navy text-tbb-cream flex items-center justify-center px-6 py-20 relative overflow-hidden">
      <Image
        src="/brand/puzzle-piece.svg"
        alt=""
        width={520}
        height={520}
        className="absolute -right-32 -top-24 opacity-[0.06] pointer-events-none"
        aria-hidden
      />
      <div className="flex flex-col items-center gap-8 text-center relative z-10 max-w-2xl">
        <Image
          src="/brand/logo-cream.png"
          alt="The Business Builders by Workplaces"
          width={560}
          height={120}
          priority
          className="w-full max-w-md h-auto"
        />
        <p className="font-bold uppercase tracking-tbb-caps text-xs sm:text-sm text-tbb-cream/70">
          Build what compounds
        </p>
        <p className="font-bold uppercase tracking-tbb-caps text-sm sm:text-base text-tbb-cream pt-2">
          Business Builder Portal
        </p>
        <p className="text-tbb-cream/85 text-base sm:text-lg max-w-md leading-relaxed">
          Coaching, deliverables, and invoicing — one operating platform
          for the Workplaces practice.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-4">
          {/* Diagnostic intentionally NOT linked here — it's a prospect
              conversion tool sent directly to prospects, not a public
              self-serve on the sign-in page (#19). */}
          {/* Route Handler that redirects + (for coaches) clears client-context
              cookies — must be a full-navigation <a>, never a prefetched <Link>
              (prefetch would fire the cookie side-effects in the background). */}
          <a
            href="/home"
            className="inline-flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-tbb-caps px-6 py-3 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 transition-colors duration-tbb-base shadow-tbb-cta"
          >
            Sign in
          </a>
        </div>
        <p className="font-mono text-tbb-cream/40 text-[11px] sm:text-xs pt-12">
          © Workplaces — HR All-In Inc., Edmonton, Alberta
        </p>
      </div>
    </main>
  );
}
