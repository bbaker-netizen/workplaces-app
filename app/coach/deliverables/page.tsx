import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachDeliverables } from "@/lib/db/queries/coach-cross-engagement";

export default async function CoachDeliverablesCrossPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach")
    redirect("/portal");

  const items = await listCoachDeliverables();
  // Group by status for the tracker view.
  const groups = new Map<string, typeof items>();
  for (const d of items) {
    let bucket = groups.get(d.status);
    if (!bucket) {
      bucket = [];
      groups.set(d.status, bucket);
    }
    bucket.push(d);
  }
  const order = [
    "in_progress",
    "review",
    "not_started",
    "delivered",
    "archived",
  ];
  const sortedKeys = Array.from(groups.keys()).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Deliverables tracker · cross-client
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
          Nothing tracked yet.
        </p>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map((s) => (
            <section key={s} className="space-y-2">
              <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                {s.replace("_", " ")} · {groups.get(s)!.length}
              </h2>
              <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
                {groups.get(s)!.map((d) => (
                  <li
                    key={d.id}
                    className="py-3 flex items-baseline gap-3 flex-wrap"
                  >
                    <span className="font-bold text-foreground text-base tracking-tight">
                      {d.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                      {d.type.replace(/_/g, " ")}
                    </span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                      {d.engagementName}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
