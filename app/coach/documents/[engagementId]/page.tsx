/**
 * Coach Documents page — same shape as the portal page, but scoped to
 * a chosen engagement so coaches can flip between clients.
 *
 * Coach cross-org gap (same as 1.2/1.3/1.4): when the coach views a
 * client engagement, the GUC binds to the master org. Today's testing
 * scope is the master org's "Bruce Test" engagement, so the gap
 * doesn't bite. Phase 1.7 introduces the coach-aware tenant helper.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { listCoachEngagements } from "@/lib/db/queries/engagements";
import { listEngagementDocuments } from "@/lib/db/queries/documents";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import {
  DocumentList,
  type DocumentRow,
} from "@/components/documents/DocumentList";

export default async function CoachDocumentsPage({
  params,
}: {
  params: { engagementId: string };
}) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    redirect("/portal");
  }

  const engagements = await listCoachEngagements();
  const engagement = engagements.find((e) => e.id === params.engagementId);
  if (!engagement) notFound();

  const docs = await listEngagementDocuments(engagement.id);
  const rows: DocumentRow[] = docs.map((d) => ({
    id: d.id,
    filename: d.originalFilename,
    fileType: d.fileType,
    sizeBytes: Number(d.sizeBytes),
    uploaderName: d.uploaderName,
    createdAt: d.createdAt,
    tags: d.tags,
    canDelete: true, // master_admin / coach can delete any
  }));

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 sm:py-12 space-y-10">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Coach Console
        </p>
        <h1 className="font-display font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {engagement.name ?? "Engagement"} · Documents
        </h1>
        <nav className="flex gap-3 text-xs font-mono uppercase tracking-[0.2em]">
          <Link
            href="/coach"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Coach
          </Link>
          {engagements.length > 1 && (
            <details className="relative">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none">
                Switch engagement
              </summary>
              <div className="absolute left-0 mt-2 z-10 bg-white border border-[#CCCCCC] rounded-md shadow-md py-1 min-w-[14rem]">
                {engagements.map((e) => (
                  <Link
                    key={e.id}
                    href={`/coach/documents/${e.id}`}
                    className="block px-3 py-1.5 text-foreground hover:bg-[#F5F1E8] normal-case tracking-normal font-sans text-sm"
                  >
                    {e.name ?? e.id.slice(0, 8)}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
      </header>

      <DocumentUploadForm engagementId={engagement.id} />
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          All documents
        </h2>
        <DocumentList rows={rows} />
      </section>
    </main>
  );
}
