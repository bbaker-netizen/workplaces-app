export default function Home() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-20">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="font-display font-bold text-foreground tracking-tight text-5xl sm:text-7xl md:text-8xl leading-none">
          THE BUILDER
        </h1>
        <p className="font-sans text-muted-foreground uppercase tracking-[0.25em] text-xs sm:text-sm">
          Coming soon
        </p>
        <p className="font-mono text-muted-foreground text-[11px] sm:text-xs pt-16">
          The Builder · By Workplaces
        </p>
      </div>
    </main>
  );
}
