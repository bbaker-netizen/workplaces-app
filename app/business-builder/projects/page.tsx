import Link from "next/link";
import { redirect } from "next/navigation";
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
      <header className="space-y-2">
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
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/portal/projects/${p.id}`}
                className="block py-3 pl-3 hover:bg-tbb-cream-50 transition-colors group"
              >
                <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="font-bold text-foreground text-base tracking-tight group-hover:underline underline-offset-4">
                    {p.name}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                    {p.engagementName ?? "Engagement"}
                  </span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {p.status}
                  </span>
                </div>
                {p.targetDate && (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
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
