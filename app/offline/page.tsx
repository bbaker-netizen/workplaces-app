import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — The Builder",
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-20">
      <div className="max-w-md text-center space-y-4">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          The Builder · By Workplaces
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Offline.
        </h1>
        <p className="font-sans text-sm text-foreground">
          You&apos;re not connected. Anything you&apos;ve already opened is
          still cached and viewable. We&apos;ll reconnect automatically when
          you&apos;re back online.
        </p>
      </div>
    </main>
  );
}
