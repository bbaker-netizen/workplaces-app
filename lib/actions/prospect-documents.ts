"use server";

/**
 * Attach / remove documents on a prospect (lead) — the manual path for
 * putting a file (e.g. the PDF from The Climb) onto a lead's record. The
 * automatic path is the /api/the-climb/ingest endpoint.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  documents,
  prospectActivities,
  prospects,
  signatureEnvelopes,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { canCurrentBbWriteProspect } from "@/lib/db/queries/prospects";
import {
  deleteDocumentBlob,
  uploadDocumentBlob,
} from "@/lib/storage/blobs";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024;

/** Upload a file and attach it to a prospect's record. */
export async function uploadProspectDocument(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const prospectId = String(formData.get("prospectId") ?? "");
  const file = formData.get("file");
  if (!prospectId) return { ok: false, error: "Missing prospect." };
  if (!(await canCurrentBbWriteProspect(prospectId))) {
    return { ok: false, error: "You don't have access to that lead." };
  }
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Choose a file to upload." };
  if (file.size > MAX_BYTES)
    return { ok: false, error: "File is larger than 25 MB." };

  try {
    const orgId = await withSystemContext(async (tx) => {
      const [p] = await tx
        .select({ orgId: prospects.orgId })
        .from(prospects)
        .where(eq(prospects.id, prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");
      return p.orgId;
    });

    const upload = await uploadDocumentBlob(orgId, file);
    try {
      const id = await withSystemContext(async (tx) => {
        const [row] = await tx
          .insert(documents)
          .values({
            id: upload.documentId,
            orgId,
            prospectId,
            blobKey: upload.blobKey,
            originalFilename: upload.filename,
            fileType: upload.fileType,
            sizeBytes: upload.sizeBytes,
            uploaderUserProfileId: profile.userProfileId,
          })
          .returning({ id: documents.id });
        await tx.insert(prospectActivities).values({
          prospectId,
          orgId,
          type: "document",
          subject: `Document added: ${upload.filename}`,
          createdByUserProfileId: profile.userProfileId,
        });
        return row.id;
      });
      revalidatePath(`/business-builder/pipeline/${prospectId}`);
      return { ok: true, data: { id } };
    } catch (e) {
      // Clean up the orphaned blob if the DB write failed.
      await deleteDocumentBlob(upload.blobKey).catch(() => {});
      throw e;
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Remove a document from a prospect (uploader or leadership only). */
export async function deleteProspectDocument(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  try {
    // Look the document up BEFORE deleting it, so the lead it hangs off can
    // be access-checked. Resolving and deleting in one pass would delete
    // another Builder's file and only then tell us whose it was.
    const found = await withSystemContext(async (tx) => {
      const [doc] = await tx
        .select({
          prospectId: documents.prospectId,
          blobKey: documents.blobKey,
        })
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);
      return doc && doc.prospectId ? doc : null;
    });
    if (!found) return { ok: false, error: "Document not found." };
    if (!(await canCurrentBbWriteProspect(found.prospectId!))) {
      return { ok: false, error: "You don't have access to that lead." };
    }

    // A document that an agreement was built from can't be deleted —
    // `signature_envelopes.source_document_id` is ON DELETE RESTRICT, so the
    // database refuses and Postgres' foreign-key error text ends up in front
    // of the user. That restriction is right: deleting the file an executed
    // contract points at would gut the audit trail. But it has to be
    // explained rather than thrown.
    const usedBy = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          id: signatureEnvelopes.id,
          subject: signatureEnvelopes.subject,
          status: signatureEnvelopes.status,
        })
        .from(signatureEnvelopes)
        .where(eq(signatureEnvelopes.sourceDocumentId, id))
        .limit(1);
      return row ?? null;
    });
    if (usedBy) {
      return {
        ok: false,
        error:
          usedBy.status === "completed"
            ? `This is the document behind a completed agreement (“${usedBy.subject}”), so it can't be deleted — it's part of that signed record.`
            : `This document was sent for signature as “${usedBy.subject}”. Void that agreement first, then delete the file.`,
      };
    }

    const removed = await withSystemContext(async (tx) => {
      await tx.delete(documents).where(eq(documents.id, id));
      return found;
    });
    await deleteDocumentBlob(removed.blobKey).catch(() => {});
    revalidatePath(`/business-builder/pipeline/${removed.prospectId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
