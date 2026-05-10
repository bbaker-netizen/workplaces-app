import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { GlobalSearchPanel } from "@/components/search/GlobalSearchPanel";

export default async function PortalSearchPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display font-bold text-foreground text-4xl tracking-tight leading-none">
          Search
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Across action items, goals, projects, deliverables, hires, documents, sessions, and messages you can see.
        </p>
      </header>

      <GlobalSearchPanel />
    </main>
  );
}
