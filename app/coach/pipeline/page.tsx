/**
 * Coach Pipeline view — Phase 4.
 *
 * Lists prospects across the master org grouped by status. Source
 * of truth for the "Prospect → diagnostic → proposal → contract →
 * onboarded" journey from CLAUDE.md.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listProspects } from "@/lib/db/queries/prospects";
import { ProspectStatusSelect } from "@/components/pipeline/ProspectStatusSelect";

const STATUS_ORDER = [
  "diagnostic_pending",
  "diagnostic_complete",
  "proposal_sent",
  "contract_sent",
  "contract_signed",
  "onboarded",
  "lost",
] as const;

const STATUS_LABEL: Record<(typeof STATUS_ORDER)[number], string> = {
  diagnostic_pending: "Diagnostic pending",
  diagnostic_complete: "Diagnostic complete",
  proposal_sent: "Proposal sent",
  contract_sent: "Contract sent",
  contract_signed: "Contract signed",
  onboarded: "Onboarded",
  lost: "Lost",
};

export default async function PipelinePage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const prospects = await listProspects();

  const grouped = new Map<string, typeof prospects>();
  for (const p of prospects) {
    const arr = grouped.get(p.status) ?? [];
    arr.push(p);
    grouped.set(p.status, arr);
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          Pipeline
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          {prospects.length} prospect{prospects.length === 1 ? "" : "s"} across all
          stages.
        </p>
        <Link
          href="/coach"
          className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground hover:text-foreground"
        >
          ← Console
        </Link>
      </header>

      {prospects.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground italic border border-tbb-line rounded-md bg-white p-6">
          No prospects yet. Direct people to{" "}
          <code className="font-mono text-xs">/diagnostic</code> to capture
          their first contact.
        </p>
      ) : (
        <div className="space-y-8">
          {STATUS_ORDER.map((status) => {
            const list = grouped.get(status) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={status} className="space-y-2">
                <h2 className="font-mono text-[11px] uppercase tracking-tbb-caps text-muted-foreground">
                  {STATUS_LABEL[status]} · {list.length}
                </h2>
                <ul className="divide-y divide-tbb-line border-t border-b border-tbb-line">
                  {list.map((p) => (
                    <li
                      key={p.id}
                      className="py-3 flex items-baseline gap-x-3 gap-y-1 flex-wrap"
                    >
                      <Link
                        href={`/coach/pipeline/${p.id}`}
                        className="font-sans text-sm font-bold text-foreground hover:underline underline-offset-4"
                      >
                        {p.companyName}
                      </Link>
                      {p.contactName && (
                        <span className="font-sans text-xs text-muted-foreground">
                          {p.contactName}
                        </span>
                      )}
                      <span className="font-mono text-[10px] uppercase tracking-tbb-caps text-muted-foreground">
                        {p.contactEmail}
                      </span>
                      <span className="ml-auto">
                        <ProspectStatusSelect
                          prospectId={p.id}
                          current={p.status}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
