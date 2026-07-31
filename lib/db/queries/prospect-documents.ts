/**
 * Documents attached to a prospect (lead) — e.g. the PDF The Climb
 * generates, or anything a Business Builder uploads to the lead's file.
 * Kept regardless of whether the prospect ever converts.
 */

import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  documents,
  signatureEnvelopes,
  userProfiles,
  type DocumentOrigin,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { canCurrentBbWriteProspect } from "@/lib/db/queries/prospects";
import type { EnvelopeRole } from "@/lib/documents/presentation";

export type ProspectDocument = {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  uploaderName: string | null;
  createdAt: Date;
  /** Recorded at write time — see migration 0106. */
  origin: DocumentOrigin;
  /**
   * The signing envelope this file belongs to, if any. Carried so the
   * panel can show an agreement's sent copy and its executed copy as one
   * thing. Two near-identically-named files days apart read as a
   * duplicate, and on KS Developments that nearly got a real signed
   * contract deleted.
   */
  envelopeId: string | null;
  envelopeSubject: string | null;
  envelopeStatus: string | null;
  envelopeRole: EnvelopeRole | null;
};

export async function listProspectDocuments(
  prospectId: string,
): Promise<ProspectDocument[]> {
  // Ungated until now — not even a role check. It runs under
  // withSystemContext, which bypasses RLS by design, so anything holding a
  // prospect id could list that lead's files. The prospect page happens to
  // gate before calling it; the email attachment picker did not.
  if (!(await canCurrentBbWriteProspect(prospectId))) return [];
  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        id: documents.id,
        filename: documents.originalFilename,
        fileType: documents.fileType,
        sizeBytes: documents.sizeBytes,
        uploaderName: userProfiles.fullName,
        createdAt: documents.createdAt,
        origin: documents.origin,
      })
      .from(documents)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, documents.uploaderUserProfileId),
      )
      .where(eq(documents.prospectId, prospectId))
      .orderBy(desc(documents.createdAt));

    if (rows.length === 0) return [];

    // Which of these files are halves of a signing envelope. One batched
    // read rather than a join, because a document can be referenced as
    // either the source or the signed output and joining twice for that
    // is harder to read than resolving it here.
    const ids = rows.map((r) => r.id);
    const envs = await tx
      .select({
        id: signatureEnvelopes.id,
        subject: signatureEnvelopes.subject,
        status: signatureEnvelopes.status,
        sourceDocumentId: signatureEnvelopes.sourceDocumentId,
        signedDocumentId: signatureEnvelopes.signedDocumentId,
      })
      .from(signatureEnvelopes)
      .where(
        or(
          inArray(signatureEnvelopes.sourceDocumentId, ids),
          inArray(signatureEnvelopes.signedDocumentId, ids),
        ),
      );

    const byDoc = new Map<
      string,
      { id: string; subject: string; status: string; role: EnvelopeRole }
    >();
    for (const e of envs) {
      if (e.sourceDocumentId && ids.includes(e.sourceDocumentId)) {
        byDoc.set(e.sourceDocumentId, {
          id: e.id,
          subject: e.subject,
          status: e.status,
          role: "source",
        });
      }
      if (e.signedDocumentId && ids.includes(e.signedDocumentId)) {
        byDoc.set(e.signedDocumentId, {
          id: e.id,
          subject: e.subject,
          status: e.status,
          role: "signed",
        });
      }
    }

    return rows.map((r) => {
      const env = byDoc.get(r.id) ?? null;
      return {
        ...r,
        envelopeId: env?.id ?? null,
        envelopeSubject: env?.subject ?? null,
        envelopeStatus: env?.status ?? null,
        envelopeRole: env?.role ?? null,
      };
    });
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
