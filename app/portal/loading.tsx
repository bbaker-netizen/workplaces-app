import { SquiggleSpinner } from "@/components/ui/SquiggleSpinner";

/**
 * Loading state for any /portal route. Same squiggle spinner as
 * the Business Builder side — clients get the same characterful loader.
 */
export default function PortalLoading() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <SquiggleSpinner size={72} label="Loading…" />
    </main>
  );
}
