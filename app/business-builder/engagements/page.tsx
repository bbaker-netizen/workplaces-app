/**
 * /business-builder/engagements — list of every active engagement. Entry point
 * for the per-engagement Workspace view.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, inArray, ne } from "drizzle-orm";
import { Briefcase, FolderSymlink } from "lucide-react";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { coachScopeWhere } from "@/lib/db/queries/business-builder-cross-engagement";
import { EngagementArchiveButton } from "@/components/business-builder/EngagementArchiveButton";
import { EngagementSearchList } from "@/components/business-builder/EngagementSearchList";
import { DeleteEngagementButton } from "@/components/business-builder/DeleteEngagementButton";
import { CollapsibleSection } from "@/components/business-builder/CollapsibleSection";
import { SyncAssignmentsButton } from "@/components/business-builder/SyncAssignmentsButton";

export default async function EngagementsListPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  // The clients this Business Builder works — own book by default, the
  // whole practice only when they've flipped the scope toggle. Shared
  // clients count as theirs.
  //
  // This page used to SELECT every engagement in the database with no
  // filter at all, which made it the one place own-book-by-default
  // didn't reach: the Clients page, and the destination of the "Switch
  // client" link. It also listed the practice's own internal workspace
  // ("Workplaces Team") as though it were a client.
  const scope = await coachScopeWhere(profile);
  const rows = scope === false ? [] : await withSystemContext(async (tx) => {
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
      // The internal workspace is not a client. It has its own home at
      // /business-builder/team, and every other client-facing list has
      // excluded it since it was introduced — this query never got the
      // filter.
      .where(
        scope
          ? and(ne(engagements.isInternal, true), scope)
          : ne(engagements.isInternal, true),
      )
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
        programType: prospects.programType,
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
            <Link
              href="/business-builder/drive-link"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-tbb-caps px-3 py-1.5 rounded-pill border border-tbb-line text-tbb-navy hover:border-tbb-blue hover:text-tbb-blue transition-colors"
            >
              <FolderSymlink className="w-3.5 h-3.5" aria-hidden /> Auto-link Drive folders
            </Link>
            {profile.role === "master_admin" && <SyncAssignmentsButton />}
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
        <EngagementSearchList
          rows={active.map((e) => ({
            id: e.id,
            name: e.name ?? "",
            orgName: e.orgName,
            contactName: e.prospect?.contactName ?? null,
            status: e.status,
            program:
              (e.prospect?.programType ?? e.type) === "implementer"
                ? "Implementer"
                : "Accelerator",
          }))}
        />
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
