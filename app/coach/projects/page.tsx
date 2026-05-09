import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachProjects } from "@/lib/db/queries/coach-cross-engagement";

export default async function CoachProjectsCrossPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach")
    redirect("/portal");

  const items = await listCoachProjects();

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Coach Console
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Projects · cross-client
        </h1>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground italic">
          No projects across any engagement.
        </p>
      ) : (
        <ul className="divide-y divide-[#CCCCCC] border-t border-b border-[#CCCCCC]">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/portal/projects/${p.id}`}
                className="block py-3 pl-3 hover:bg-[#F5F1E8] transition-colors group"
              >
                <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="font-display font-bold text-foreground text-base tracking-tight group-hover:underline underline-offset-4">
                    {p.name}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    {p.engagementName ?? "Engagement"}
                  </span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {p.status}
                  </span>
                </div>
                {p.targetDate && (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
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
