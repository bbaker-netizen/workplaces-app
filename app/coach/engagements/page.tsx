/**
 * /coach/engagements — list of every active engagement. Entry point
 * for the per-engagement Workspace view.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, Briefcase, Plus } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export default async function EngagementsListPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // Engagement list for coaches: any engagement in the org's
  // visibility. We join with orgs and prospects so the row can show
  // the client's company name and contact name.
  const rows = await withSystemContext(async (tx) => {
    const engs = await tx
      .select({
        id: engagements.id,
        name: engagements.name,
        type: engagements.type,
        status: engagements.status,
        startDate: engagements.startDate,
        orgId: engagements.orgId,
      })
      .from(engagements)
      .orderBy(desc(engagements.createdAt));
    if (engs.length === 0) return [];
    const orgIds = Array.from(new Set(engs.map((e) => e.orgId)));
    const orgRows = await tx
      .select({ id: orgs.id, name: orgs.name })
      .from(orgs)
      .where(inArray(orgs.id, orgIds));
    const prospectRows = await tx
      .select({
        engagementId: prospects.convertedEngagementId,
        contactName: prospects.contactName,
        companyName: prospects.companyName,
      })
      .from(prospects)
      .where(inArray(prospects.convertedEngagementId, engs.map((e) => e.id)));
    const orgById = new Map(orgRows.map((o) => [o.id, o.name]));
    const prospectByEng = new Map(
      prospectRows
        .filter((p) => p.engagementId)
        .map((p) => [p.engagementId!, p]),
    );
    return engs.map((e) => ({
      ...e,
      orgName: orgById.get(e.orgId) ?? null,
      prospect: prospectByEng.get(e.id) ?? null,
    }));
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-2 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="tbb-eyebrow">Clients</p>
          <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
            Engagements
          </h1>
          <p className="text-sm text-tbb-ink-3 max-w-2xl">
            Each active client engagement. Click in for the
            Workspace view — goals, projects, and action items in one
            place.
          </p>
        </div>
        <Link
          href="/coach/engagements/new"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-2 rounded-pill bg-tbb-blue text-white hover:bg-tbb-blue-700 shadow-tbb-cta"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden /> New engagement
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-2">
          <Briefcase className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">No engagements yet.</p>
          <p className="text-sm text-tbb-ink-3">
            Engagements show up after a prospect signs a BBA and you create
            their workspace.
          </p>
        </div>
      ) : (
        <ul className="border border-tbb-line rounded-lg bg-white divide-y divide-tbb-line-soft overflow-hidden shadow-tbb-sm">
          {rows.map((e) => (
            <li key={e.id}>
              <Link
                href={`/coach/engagements/${e.id}`}
                className="flex items-center gap-3 px-5 py-4 hover:bg-tbb-cream-50 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-tbb-navy">
                    {e.name ?? e.orgName ?? "Untitled engagement"}
                  </span>
                  <span className="block text-xs text-tbb-ink-3 mt-0.5">
                    {e.prospect?.contactName && `${e.prospect.contactName} · `}
                    <span className="capitalize">{e.type}</span>
                    {e.status !== "active" && (
                      <> · <span className="capitalize">{e.status}</span></>
                    )}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-tbb-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
