import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementHires } from "@/lib/db/queries/hires";

const STATUS_LABEL: Record<string, string> = {
  assessing: "Assessing",
  interview_scheduled: "Interview scheduled",
  decision_pending: "Decision pending",
  offer_sent: "Offer sent",
  hired: "Hired",
  declined: "Declined",
};

const STATUS_ORDER: Record<string, number> = {
  assessing: 0,
  interview_scheduled: 1,
  decision_pending: 2,
  offer_sent: 3,
  hired: 4,
  declined: 5,
};

const STATUS_TONE: Record<string, string> = {
  assessing: "text-muted-foreground",
  interview_scheduled: "text-tbb-navy font-bold",
  decision_pending: "text-tbb-danger font-bold",
  offer_sent: "text-tbb-navy font-bold",
  hired: "text-tbb-navy font-bold",
  declined: "text-muted-foreground line-through",
};

export default async function HiringPipelinePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  const engagement = await getCurrentEngagement();
  if (!engagement) redirect("/portal");

  const canCreate =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  const hires = await listEngagementHires(engagement.id);

  // Group by status for a kanban-ish read.
  const byStatus = new Map<string, typeof hires>();
  for (const h of hires) {
    let bucket = byStatus.get(h.status);
    if (!bucket) {
      bucket = [];
      byStatus.set(h.status, bucket);
    }
    bucket.push(h);
  }
  const orderedStatuses = Array.from(byStatus.keys()).sort(
    (a, b) => (STATUS_ORDER[a] ?? 99) - (STATUS_ORDER[b] ?? 99),
  );

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            {engagement.name ?? "Engagement"}
          </p>
          <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
            Hiring pipeline
          </h1>
          <p className="font-sans text-sm text-muted-foreground">
            TTI gap report → interview → assessment → offer → hired.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/portal/hiring/new"
            className="inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-tbb-caps px-4 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700"
          >
            <Plus className="w-4 h-4" aria-hidden /> New candidate
          </Link>
        )}
      </header>

      {hires.length === 0 ? (
        <div className="border border-tbb-line rounded-md bg-white p-6 space-y-2">
          <p className="font-bold text-foreground text-base tracking-tight">
            No candidates yet
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            {canCreate
              ? "Add your first candidate above."
              : "Your Business Builder will track candidates here."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {orderedStatuses.map((status) => (
            <section key={status} className="space-y-2">
              <h2
                className={
                  "font-mono text-[11px] uppercase tracking-tbb-caps " +
                  (STATUS_TONE[status] ?? "text-muted-foreground")
                }
              >
                {STATUS_LABEL[status] ?? status} · {byStatus.get(status)!.length}
              </h2>
              <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
                {byStatus.get(status)!.map((h) => (
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
                          {h.roleName}
                        </span>
                      </div>
                      {h.candidateEmail && (
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {h.candidateEmail}
                        </p>
                      )}
                    </Link>
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
