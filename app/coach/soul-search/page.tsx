/**
 * Coach-side Soul File semantic search.
 *
 * Phase 3.3. Surface the searchSoulFiles action built in 2.6.
 * Coach types a natural-language query, we embed it, search every
 * Soul File across their engagements by cosine distance.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { SoulSearchPanel } from "@/components/soul-file/SoulSearchPanel";

export default async function SoulSearchPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Soul File search
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Ask in plain English. Searches every Soul File across your engagements by meaning, not keywords.
        </p>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
      </header>

      <SoulSearchPanel />
    </main>
  );
}
