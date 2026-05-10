"use server";

/**
 * Document versioning.
 *
 * Phase 3.11. Upload a new version of an existing document — the
 * old row stays (for audit/history); the new row gets the same
 * parent_document_id chain and an incremented version number.
 * Latest version = highest `version` number for a given parent.
 */

import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { documents } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import { uploadDocumentBlob } from "@/lib/storage/blobs";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function uploadDocumentVersion(
  formData: FormData,
): Promise<ActionResult<{ id: string; version: number }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };

  const parentId = formData.get("parentDocumentId");
  const file = formData.get("file");
  if (typeof parentId !== "string" || !z.string().uuid().safeParse(parentId).success)
    return { ok: false, error: "Missing parent document id." };
  if (!(file instanceof File))
    return { ok: false, error: "Pick a file to upload." };

  const engagementId = await resolveEngagementIdFromRecord(
    "documents",
    parentId,
  );
  if (!engagementId)
    return { ok: false, error: "Parent document not found." };

  let upload: Awaited<ReturnType<typeof uploadDocumentBlob>>;
  try {
    const boundOrgId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (_tx, orgId) => orgId,
    );
    upload = await uploadDocumentBlob(boundOrgId, file);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        // Resolve the chain root: if the parent already has a
        // parent_document_id, walk up. For Phase 3.11 we keep it
        // simple — chain depth = 1 (versions point at the original).
        const [parent] = await tx
          .select({
            id: documents.id,
            parentDocumentId: documents.parentDocumentId,
          })
          .from(documents)
          .where(eq(documents.id, parentId))
          .limit(1);
        if (!parent) throw new Error("Parent document missing.");
        const chainRoot = parent.parentDocumentId ?? parent.id;

        // Find the highest existing version in the chain.
        const [latest] = await tx
          .select({ version: documents.version })
          .from(documents)
          .where(
            sql`(documents.id = ${chainRoot} OR documents.parent_document_id = ${chainRoot})`,
          )
          .orderBy(desc(documents.version))
          .limit(1);
        const nextVersion = (Number(latest?.version) || 1) + 1;

        const [row] = await tx
          .insert(documents)
          .values({
            id: upload.documentId,
            orgId: boundOrgId,
            engagementId,
            blobKey: upload.blobKey,
            originalFilename: upload.filename,
            fileType: upload.fileType,
            sizeBytes: upload.sizeBytes,
            uploaderUserProfileId: profile.userProfileId,
            version: nextVersion,
            parentDocumentId: chainRoot,
          })
          .returning({
            id: documents.id,
            version: documents.version,
          });
        return row;
      },
    );

    revalidatePath("/portal/documents");
    return {
      ok: true,
      data: { id: created.id, version: Number(created.version) },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
