import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getCurrentEngagement } from "@/lib/db/queries/engagements";
import { listEngagementDocuments } from "@/lib/db/queries/documents";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import {
  DocumentList,
  type DocumentRow,
} from "@/components/documents/DocumentList";

export default async function PortalDocumentsPage() {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") redirect("/no-invitation");

  const engagement = await getCurrentEngagement();
  if (!engagement) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-bold text-foreground text-3xl tracking-tight">
          No engagement yet
        </h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Your portal isn&apos;t bound to an engagement. If you expect access,
          contact your coach.
        </p>
      </main>
    );
  }

  const isLeadership =
    profile.role === "master_admin" ||
    profile.role === "coach" ||
    profile.role === "client_lead" ||
    profile.role === "client_manager";

  const docs = await listEngagementDocuments(engagement.id);
  const rows: DocumentRow[] = docs.map((d) => ({
    id: d.id,
    filename: d.originalFilename,
    fileType: d.fileType,
    sizeBytes: Number(d.sizeBytes),
    uploaderName: d.uploaderName,
    createdAt: d.createdAt,
    tags: d.tags,
    canDelete:
      isLeadership || d.uploaderUserProfileId === profile.userProfileId,
  }));

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          {engagement.name ?? "Engagement"}
        </p>
        <h1 className="font-bold text-foreground text-4xl tracking-tight leading-none">
          Documents
        </h1>
        <p className="font-sans text-sm text-muted-foreground">
          Files shared inside this engagement. Click a name to download.
        </p>
      </header>

      <div className="space-y-8">
        <DocumentUploadForm engagementId={engagement.id} />
        <section className="space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
            All documents
          </h2>
          <DocumentList rows={rows} />
        </section>
      </div>
    </main>
  );
}
