import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

export default function CoachHome() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-20">
      <div className="flex flex-col items-center gap-8 text-center max-w-2xl">
        <h1 className="font-display font-bold text-foreground tracking-tight text-4xl sm:text-6xl leading-none">
          Coach Console
        </h1>
        <p className="font-sans text-muted-foreground max-w-md leading-relaxed">
          Phase 1.1 surface — engagement creation lives here. The full coach
          dashboard, pipeline, and cross-engagement views land in later phases
          and run primarily in Cowork.
        </p>
        <Link
          href="/coach/engagements/new"
          className="font-sans bg-foreground text-background px-6 py-3 rounded-md hover:bg-secondary transition-colors uppercase tracking-wider text-sm"
        >
          + New engagement
        </Link>
        <Link
          href="/portal"
          className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          Back to portal
        </Link>
        <SignOutButton redirectUrl="/">
          <button className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </main>
  );
}
