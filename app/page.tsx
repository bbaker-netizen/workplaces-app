import Image from "next/image";

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
      <div className="flex flex-col items-center gap-8 text-center relative z-10">
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
        <p className="font-mono text-tbb-cream/50 text-[11px] sm:text-xs pt-12">
          Coaching, deliverables, and invoicing — one operating platform.
        </p>
      </div>
    </main>
  );
}
