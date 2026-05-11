/**
 * Public diagnostic intake — Phase 4. Anonymous prospects fill this
 * out; submission creates a Prospect record visible in the Coach
 * Pipeline. No authentication.
 */

import type { Metadata } from "next";
import { DiagnosticForm } from "@/components/diagnostic/DiagnosticForm";

export const metadata: Metadata = {
  title: "Business diagnostic — The Builder",
  description:
    "Tell us where your business is today. We'll review and reach out within two business days.",
};

export default function DiagnosticPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 sm:py-20">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Business Builder Portal · By Workplaces
          </p>
          <h1 className="font-bold text-foreground text-4xl sm:text-5xl tracking-tight leading-none">
            Business diagnostic.
          </h1>
          <p className="font-sans text-base text-foreground">
            A short intake to help us understand where your business is
            today and what would move it forward. We&apos;ll review and
            be in touch within two business days.
          </p>
        </header>

        <DiagnosticForm />

        <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
          Build what compounds.
        </p>
      </div>
    </main>
  );
}
