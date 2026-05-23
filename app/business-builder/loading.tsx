import { SquiggleSpinner } from "@/components/ui/SquiggleSpinner";

/**
 * Loading state for any /business-builder route. Shows the squiggle spinner
 * while the page's server data is in flight — replaces the page
 * itself, so the user always has feedback during the wait.
 */
export default function CoachLoading() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <SquiggleSpinner size={72} label="Building…" />
    </main>
  );
}
