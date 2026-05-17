import { SquiggleSpinner } from "@/components/ui/SquiggleSpinner";

/**
 * Root-level loading state. Rendered automatically by Next.js App
 * Router while any page below this segment streams its server data.
 * Replaced by the page once the data resolves.
 */
export default function GlobalLoading() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <SquiggleSpinner size={72} label="Building…" />
    </main>
  );
}
