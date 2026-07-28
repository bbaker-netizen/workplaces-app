import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getClientScope,
  canSeeAllClients,
  listCoachDeliverables,
} from "@/lib/db/queries/business-builder-cross-engagement";
import { ClientScopeToggle } from "@/components/business-builder/ClientScopeToggle";

/** Readable status names. `s.replace("_", " ")` only ever replaced the FIRST
 *  underscore, and "not started" reads better than "not_started" anyway. */
const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  review: "In review",
  not_started: "Not started",
  delivered: "Delivered",
  archived: "Archived",
};

export default async function CoachDeliverablesCrossPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach")
    redirect("/portal");

  const scope = await getClientScope();
  const canToggleScope = await canSeeAllClients();
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
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <Link
            href="/business-builder"
            className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
          >
            ← Console
          </Link>
          {canToggleScope && <ClientScopeToggle current={scope} />}
        </div>
      </header>

      {items.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground italic">
          Nothing tracked yet.
        </p>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map((s) => (
            <section key={s} className="space-y-2">
              {/* Count leads, at a size you can actually read. It was set in
                  11px muted mono alongside the label — the one number on the
                  page telling you how much work is in each state, rendered
                  smaller than everything around it. */}
              <h2 className="flex items-baseline gap-2">
                <span className="font-bold text-foreground text-2xl tabular-nums leading-none">
                  {groups.get(s)!.length}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                  {STATUS_LABEL[s] ?? s.replace(/_/g, " ")}
                </span>
              </h2>
              <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
                {groups.get(s)!.map((d) => {
                  const due = d.targetDate ? new Date(d.targetDate) : null;
                  const overdue =
                    due !== null && due < new Date() && d.status !== "delivered";
                  return (
                    <li key={d.id}>
                      {/* The whole row is a link. Previously nothing here was
                          clickable, so the tracker told you work existed and
                          gave you no way to act on it. */}
                      <Link
                        href={`/business-builder/engagements/${d.engagementId}`}
                        className="py-2.5 px-1 -mx-1 flex items-baseline gap-x-3 gap-y-1 flex-wrap rounded hover:bg-tbb-cream-50"
                      >
                        <span className="font-bold text-foreground text-sm tracking-tight">
                          {d.title}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                          {d.type.replace(/_/g, " ")}
                        </span>
                        {due && (
                          // Overdue in Safety Vest Orange — the brand reserves
                          // it for high-attention moments, and a deliverable
                          // past its date is one.
                          <span
                            className={
                              "font-mono text-[10px] uppercase tracking-tbb-caps " +
                              (overdue
                                ? "font-bold text-tbb-blue"
                                : "text-muted-foreground")
                            }
                          >
                            {overdue ? "Overdue · " : "Due "}
                            {due.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-tbb-caps text-tbb-navy">
                          {d.engagementName}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
