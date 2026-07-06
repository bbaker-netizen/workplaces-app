/**
 * Documents attached to a prospect (lead) — e.g. the PDF The Climb
 * generates, or anything a Business Builder uploads to the lead's file.
 * Kept regardless of whether the prospect ever converts.
 */

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { documents, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";

export type ProspectDocument = {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  uploaderName: string | null;
  createdAt: Date;
};

export async function listProspectDocuments(
  prospectId: string,
): Promise<ProspectDocument[]> {
  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        id: documents.id,
        filename: documents.originalFilename,
        fileType: documents.fileType,
        sizeBytes: documents.sizeBytes,
        uploaderName: userProfiles.fullName,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, documents.uploaderUserProfileId),
      )
      .where(eq(documents.prospectId, prospectId))
      .orderBy(desc(documents.createdAt));
    return rows;
  });
}

/**
 * Fetch a prospect-attached document's blob metadata for the download
 * route. Business Builders only (prospect docs are coach-side). Returns
 * null for engagement documents (those go through the normal getDocument
 * path) or when the caller isn't a Business Builder.
 */
export async function getProspectDocumentForDownload(
  id: string,
): Promise<{ blobKey: string; filename: string; fileType: string } | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  if (profile.role !== "master_admin" && profile.role !== "coach") return null;
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        blobKey: documents.blobKey,
        filename: documents.originalFilename,
        fileType: documents.fileType,
      })
      .from(documents)
      .where(and(eq(documents.id, id), isNotNull(documents.prospectId)))
      .limit(1);
    return row ?? null;
  });
}
