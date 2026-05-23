/**
 * /business-builder/library — Bruce + Jen's resource library. Tools they've
 * built, tutorial videos, written guides. Filterable by type, with
 * an "Add resource" button that opens the editor in-place.
 */

import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { resources } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ResourceLibraryManager } from "@/components/library/ResourceLibraryManager";

export default async function ResourceLibraryPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  let rows: Array<typeof resources.$inferSelect> = [];
  let loadError: string | null = null;
  try {
    rows = await withSystemContext(async (tx) =>
      tx
        .select()
        .from(resources)
        .where(eq(resources.orgId, profile.orgId))
        .orderBy(desc(resources.updatedAt)),
    );
  } catch (e) {
    console.error("[ResourceLibraryPage] load failed:", e);
    loadError =
      e instanceof Error
        ? e.message
        : "Couldn't load the resource library.";
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="tbb-eyebrow">Resources</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Tools &amp; tutorials
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Your growing library of apps, video tutorials, and written
          guides. Build it once here, deploy to specific clients as
          needed.
        </p>
      </header>

      {loadError ? (
        <div className="border border-tbb-danger bg-tbb-cream-50 rounded-lg p-5 space-y-2">
          <p className="font-bold text-tbb-danger">
            Couldn&apos;t load the library.
          </p>
          <p className="text-sm text-tbb-ink-2">
            {loadError}. If this is your first time opening this page, the
            database migration that creates the resources table may not have
            applied yet. Wait a minute and refresh — the auto-migrator runs
            on every deploy.
          </p>
        </div>
      ) : (
        <ResourceLibraryManager
          initial={rows.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            type: r.type,
            url: r.url,
            thumbnailUrl: r.thumbnailUrl,
            tags: r.tags,
            audience: r.audience,
            isPublished: r.isPublished,
            updatedAt: r.updatedAt,
          }))}
        />
      )}
    </main>
  );
}
