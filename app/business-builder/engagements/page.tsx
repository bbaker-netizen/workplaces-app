/**
 * /business-builder/engagements — list of every active engagement. Entry point
 * for the per-engagement Workspace view.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, inArray } from "drizzle-orm";
import { ArrowRight, Briefcase, Eye, FolderSymlink } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { EngagementArchiveButton } from "@/components/business-builder/EngagementArchiveButton";
import { DeleteEngagementButton } from "@/components/business-builder/DeleteEngagementButton";
import { CollapsibleSection } from "@/components/business-builder/CollapsibleSection";
import { SeedDemoButton } from "@/components/business-builder/SeedDemoButton";

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
        slug: engagements.slug,
        type: engagements.type,
        status: engagements.status,
        archivedAt: engagements.archivedAt,
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
        archivedAt: prospects.archivedAt,
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

  // Archived clients drop off the main list into a separate, restorable
  // section. Archive is the single source of truth — set directly or when
  // the client's contact is archived. Both lists read A→Z by client name.
  const byName = (
    a: { name: string | null; orgName: string | null },
    b: { name: string | null; orgName: string | null },
  ) =>
    (a.name ?? a.orgName ?? "").localeCompare(
      b.name ?? b.orgName ?? "",
      undefined,
      { sensitivity: "base" },
    );
  const active = rows.filter((e) => !e.archivedAt).sort(byName);
  const archived = rows.filter((e) => e.archivedAt).sort(byName);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
      <header className="space-y-1">
        <p className="tbb-eyebrow">Clients</p>
        <h1 className="text-tbb-h2 font-black text-tbb-navy tracking-tbb-tight">
          Engagements
        </h1>
        <p className="text-sm text-tbb-ink-3 max-w-2xl">
          Each active client engagement. Click in for the Workspace view —
          goals, projects, and action items in one place. Engagements are
          created from a prospect&apos;s &ldquo;Convert to engagement&rdquo;
          button in the Pipeline.
        </p>
        {(profile.role === "master_admin" || profile.role === "coach") && (
          <div className="pt-2 flex items-center gap-2 flex-wrap">
            <SeedDemoButton />
            <Link
              href="/business-builder/drive-link"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
            >
              <FolderSymlink className="w-3.5 h-3.5" aria-hidden /> Auto-link Drive folders
            </Link>
          </div>
        )}
      </header>

      {active.length === 0 ? (
        <div className="border border-dashed border-tbb-line rounded-lg bg-white p-10 text-center space-y-2">
          <Briefcase className="w-8 h-8 text-tbb-blue mx-auto" aria-hidden />
          <p className="font-bold text-tbb-navy">No active engagements.</p>
          <p className="text-sm text-tbb-ink-3">
            Engagements show up after a prospect signs a BBA and you create
            their workspace.
          </p>
        </div>
      ) : (
        <ul className="border border-tbb-line rounded-lg bg-white divide-y divide-tbb-line-soft overflow-hidden shadow-tbb-sm">
          {active.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-5 py-4 hover:bg-tbb-cream-50 transition-colors">
              <Link
                href={`/business-builder/engagements/${e.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
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
                <ArrowRight className="w-4 h-4 text-tbb-ink-3 shrink-0" aria-hidden />
              </Link>
              {e.slug && (
                <Link
                  href={`/portal/e/${e.slug}`}
                  title="See this client's portal exactly as they see it"
                  className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tbb-caps px-2.5 py-1.5 rounded-pill border border-tbb-line text-tbb-blue hover:border-tbb-blue hover:bg-white transition-colors"
                >
                  <Eye className="w-3 h-3" aria-hidden /> View portal
                </Link>
              )}
              <EngagementArchiveButton
                engagementId={e.id}
                engagementName={e.name ?? e.orgName ?? "this client"}
                archived={false}
              />
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <CollapsibleSection
          title={`Archived clients (${archived.length}) — restore or delete`}
          defaultOpen
        >
          <ul className="mt-2 border border-tbb-line rounded-lg bg-tbb-cream-50 divide-y divide-tbb-line-soft overflow-hidden">
            {archived.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-5 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-tbb-ink-3 line-through truncate">
                    {e.name ?? e.orgName ?? "Untitled engagement"}
                  </span>
                  <span className="block text-[11px] text-tbb-ink-4">
                    {e.prospect?.contactName && `${e.prospect.contactName} · `}
                    Archived
                  </span>
                </span>
                <EngagementArchiveButton
                  engagementId={e.id}
                  engagementName={e.name ?? e.orgName ?? "this client"}
                  archived
                />
                <DeleteEngagementButton
                  engagementId={e.id}
                  engagementName={e.name ?? e.orgName ?? "this client"}
                />
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </main>
  );
}
