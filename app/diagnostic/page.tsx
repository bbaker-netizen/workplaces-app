/**
 * Public diagnostic intake — Phase 4. Anonymous prospects fill this
 * out; submission creates a Prospect record visible in the Business Builder
 * Pipeline. No authentication.
 */

import type { Metadata } from "next";
import { StagesAssessment } from "@/components/diagnostic/StagesAssessment";

export const metadata: Metadata = {
  title: "What stage is your business in? — The Builder",
  description:
    "A 2-minute assessment that places your business on its stage of growth and shows what to build next.",
};

export default function DiagnosticPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 sm:py-20">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Stages of Growth · By Workplaces
          </p>
          <h1 className="font-bold text-foreground text-4xl sm:text-5xl tracking-tight leading-none">
            What stage is your business in?
          </h1>
          <p className="font-sans text-base text-foreground">
            Every business moves through stages as it grows — and what got
            you here usually isn&apos;t what gets you to the next stage.
            Answer a few questions and we&apos;ll show you where you are,
            what tends to break next, and what to build to move forward.
          </p>
        </header>

        <StagesAssessment />

        <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Build what compounds.
        </p>
      </div>
    </main>
  );
}
