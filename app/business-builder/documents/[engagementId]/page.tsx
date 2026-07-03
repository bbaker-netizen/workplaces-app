/**
 * Coach Documents page — same shape as the portal page, but scoped to
 * a chosen engagement so coaches can flip between clients.
 *
 * Coach cross-org gap (same as 1.2/1.3/1.4): when the Business Builder views a
 * client engagement, the GUC binds to the master org. Today's testing
 * scope is the master org's "Bruce Test" engagement, so the gap
 * doesn't bite. Phase 1.7 introduces the Business Builder-aware tenant helper.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  getEngagementByIdOrSlug,
  listCoachEngagements,
} from "@/lib/db/queries/engagements";
import { listEngagementDocuments } from "@/lib/db/queries/documents";
import { listEnvelopesForEngagement } from "@/lib/db/queries/signatures";
import {
  engagements as engagementsTable,
  googleCalendarTokens,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  listFolderFiles,
  type DriveFile,
} from "@/lib/integrations/google-drive";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import {
  DocumentList,
  type DocumentRow,
} from "@/components/documents/DocumentList";
import { DocumentSigningPanel } from "@/components/signing/DocumentSigningPanel";
import { EngagementDrivePanel } from "@/components/drive/EngagementDrivePanel";

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

  // Resolve directly by id (like the engagement detail page) so this works
  // for archived engagements too — listCoachEngagements excludes archived,
  // which 404'd the Documents & Drive button for wrapped-up clients.
  const engagement = await getEngagementByIdOrSlug(params.engagementId);
  if (!engagement) notFound();
  // The "Switch engagement" dropdown still lists the active ones.
  const engagements = await listCoachEngagements();

  const [docs, envelopes, hasStoredSig, googleState, engagementWithDrive] =
    await Promise.all([
      listEngagementDocuments(engagement.id),
      listEnvelopesForEngagement(engagement.id),
      withSystemContext(async (tx) => {
        const [row] = await tx
          .select({ signatureImageData: userProfiles.signatureImageData })
          .from(userProfiles)
          .where(eq(userProfiles.id, profile.userProfileId))
          .limit(1);
        return Boolean(row?.signatureImageData);
      }),
      withSystemContext(async (tx) => {
        const [row] = await tx
          .select({ scope: googleCalendarTokens.scope })
          .from(googleCalendarTokens)
          .where(
            eq(googleCalendarTokens.userProfileId, profile.userProfileId),
          )
          .limit(1);
        return row ?? null;
      }),
      withSystemContext(async (tx) => {
        const [row] = await tx
          .select({
            folderId: engagementsTable.googleDriveFolderId,
            folderName: engagementsTable.googleDriveFolderName,
            managed: engagementsTable.googleDriveManaged,
          })
          .from(engagementsTable)
          .where(eq(engagementsTable.id, engagement.id))
          .limit(1);
        return row ?? null;
      }),
    ]);

  const isGoogleConnected = Boolean(googleState);
  // Token may hold drive.readonly (old) and/or drive.file (new, needed to
  // create managed folders + upload). Either drive scope lets us read/list.
  const grantedScopes = (googleState?.scope ?? "").split(" ");
  const hasDriveScope = grantedScopes.some((s) =>
    s.startsWith("https://www.googleapis.com/auth/drive"),
  );
  const hasDriveWrite =
    grantedScopes.includes("https://www.googleapis.com/auth/drive.file") ||
    grantedScopes.includes("https://www.googleapis.com/auth/drive");
  const linkedFolderId = engagementWithDrive?.folderId ?? null;
  const linkedFolderName = engagementWithDrive?.folderName ?? null;
  const driveManaged = engagementWithDrive?.managed ?? false;

  // Pull files for the linked folder if there is one and Drive scope is granted.
  let driveFiles: DriveFile[] = [];
  let driveError: string | null = null;
  if (linkedFolderId && hasDriveScope) {
    try {
      driveFiles = await listFolderFiles(profile.userProfileId, linkedFolderId);
    } catch (e) {
      driveError = e instanceof Error ? e.message : "Drive is unreachable.";
    }
  }
  const rows: DocumentRow[] = docs.map((d) => ({
    id: d.id,
    filename: d.originalFilename,
    fileType: d.fileType,
    sizeBytes: Number(d.sizeBytes),
    uploaderName: d.uploaderName,
    createdAt: d.createdAt,
    tags: d.tags,
    canDelete: true, // master_admin / Coach can delete any
  }));

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 sm:py-12 space-y-10">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          Business Builder Console
        </p>
        <h1 className="font-bold text-foreground text-3xl sm:text-4xl tracking-tight leading-none">
          {engagement.name ?? "Engagement"} · Documents
        </h1>
        <nav className="flex gap-3 text-xs font-mono uppercase tracking-tbb-caps">
          <Link
            href="/business-builder"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Coach
          </Link>
          {engagements.length > 1 && (
            <details className="relative">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none">
                Switch engagement
              </summary>
              <div className="absolute left-0 mt-2 z-10 bg-white border border-tbb-line rounded-md shadow-md py-1 min-w-[14rem]">
                {engagements.map((e) => (
                  <Link
                    key={e.id}
                    href={`/business-builder/documents/${e.id}`}
                    className="block px-3 py-1.5 text-foreground hover:bg-tbb-cream-50 normal-case tracking-normal font-sans text-sm"
                  >
                    {e.name ?? e.id.slice(0, 8)}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
      </header>

      <EngagementDrivePanel
        engagementId={engagement.id}
        linkedFolderId={linkedFolderId}
        linkedFolderName={linkedFolderName}
        managed={driveManaged}
        files={driveFiles}
        fileFetchError={driveError}
        isGoogleConnected={isGoogleConnected}
        hasDriveScope={hasDriveScope}
        hasDriveWrite={hasDriveWrite}
      />

      <DocumentUploadForm
        engagementId={engagement.id}
        hasSharedDriveFolder={Boolean(linkedFolderId)}
      />

      <DocumentSigningPanel
        engagementId={engagement.id}
        documents={rows.map((r) => ({ id: r.id, filename: r.filename }))}
        envelopes={envelopes.map((e) => ({
          id: e.id,
          subject: e.subject,
          status: e.status,
          createdAt: e.createdAt,
          completedAt: e.completedAt,
        }))}
        hasStoredSignature={hasStoredSig}
      />

      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-tbb-caps text-muted-foreground">
          All documents
        </h2>
        <DocumentList rows={rows} />
      </section>
    </main>
  );
}
