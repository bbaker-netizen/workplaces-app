import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachProjects } from "@/lib/db/queries/business-builder-cross-engagement";

export default async function CoachProjectsCrossPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach")
    redirect("/portal");

  const items = await listCoachProjects();

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            Business Builder Console
          </p>
          <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
            Projects · cross-client
          </h1>
          <Link
            href="/business-builder"
            className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
          >
            ← Console
          </Link>
        </div>
        <Link
          href="/business-builder/projects/new"
          className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
        >
          <Plus className="w-4 h-4" aria-hidden /> New project
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-md bg-white p-8 text-center space-y-2">
          <p className="text-3xl" aria-hidden>🏗️</p>
          <p className="font-bold text-foreground text-base tracking-tight">
            No projects in flight right now.
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            Projects are the bigger initiatives that span weeks — &quot;Build
            Acme&apos;s hiring system,&quot; &quot;Launch the new website.&quot;
            Tasks and milestones live inside each project.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/business-builder/projects/${p.id}`}
                className="block h-full border border-tbb-line rounded-lg bg-white p-4 hover:border-tbb-blue hover:shadow-tbb-sm transition-all group space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-foreground text-base tracking-tight group-hover:text-tbb-blue">
                    {p.name}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-tbb-caps text-tbb-ink-3 bg-tbb-cream-50 border border-tbb-line rounded-pill px-2 py-0.5">
                    {p.status}
                  </span>
                </div>
                <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                  {p.engagementName ?? "Engagement"}
                </p>
                {p.targetDate && (
                  <p className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                    Target {new Date(p.targetDate).toLocaleDateString()}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
