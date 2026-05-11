import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachHires } from "@/lib/db/queries/coach-cross-engagement";

export default async function CoachHiringCrossPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach")
    redirect("/portal");

  const items = await listCoachHires();

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Coach Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Hiring pipeline · cross-client
        </h1>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground italic">
          No candidates across any engagement.
        </p>
      ) : (
        <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
          {items.map((h) => (
            <li key={h.id}>
              <Link
                href={`/portal/hiring/${h.id}`}
                className="block py-3 pl-3 hover:bg-tbb-cream-50 transition-colors group"
              >
                <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                  <span className="font-bold text-foreground text-base tracking-tight group-hover:underline underline-offset-4">
                    {h.candidateName}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                    {h.roleName} · {h.engagementName ?? "Engagement"}
                  </span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                    {h.status.replace("_", " ")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
