"use server";

/**
 * Documents — server actions (mutations).
 *
 * Phase 1.5. Three surfaces:
 *
 *   - `uploadDocument(formData)` — accepts a `File` plus engagement
 *     id, writes the file to Netlify Blobs, inserts the `documents`
 *     row, returns the new document id. Used by the Documents page
 *     and by the composer paperclip (composer keeps the id around
 *     and links it via `message_attachments` when the message sends).
 *   - `deleteDocument(id)` — removes the `documents` row AND its blob.
 *     Cascade on `message_attachments` cleans up any attach rows.
 *   - `setDocumentTags(documentId, tags)` — replace the tag list on
 *     a document. Whole-list replace is simpler than partial updates
 *     and matches how the UI presents tags (a single chip row).
 *
 * Authorization: anyone in the engagement (RLS gates the org). For
 * now any role can upload + delete + tag. Per-role finer grain
 * deferred to Phase 2 once team members are routine.
 */

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  documentTags,
  documents,
  engagements,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import {
  deleteDocumentBlob,
  uploadDocumentBlob,
} from "@/lib/storage/blobs";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ------------------------------- upload ------------------------------- */

export type UploadDocumentResult = {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
};

export async function uploadDocument(
  formData: FormData,
): Promise<ActionResult<UploadDocumentResult>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (profile.role === "prospect") {
    return { ok: false, error: "Your role can't upload documents." };
  }

  const engagementId = formData.get("engagementId");
  const file = formData.get("file");
  const tagsRaw = formData.get("tags");

  if (typeof engagementId !== "string") {
    return { ok: false, error: "Missing engagement id." };
  }
  if (!z.string().uuid().safeParse(engagementId).success) {
    return { ok: false, error: "Invalid engagement id." };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "Pick a file to upload." };
  }
  const tags =
    typeof tagsRaw === "string"
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0 && t.length <= 50)
          .slice(0, 12)
      : [];

  // Resolve the engagement's org id once (works cross-org for coach
  // roles) and re-use it for both the blob path and the row insert.
  let boundOrgId: string;
  try {
    boundOrgId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, orgId) => {
        const [eng] = await tx
          .select({ id: engagements.id })
          .from(engagements)
          .where(eq(engagements.id, engagementId))
          .limit(1);
        if (!eng) throw new Error("Engagement not found.");
        return orgId;
      },
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let upload: Awaited<ReturnType<typeof uploadDocumentBlob>>;
  try {
    upload = await uploadDocumentBlob(boundOrgId, file);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed.",
    };
  }

  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, txOrgId) => {
      const [row] = await tx
        .insert(documents)
        .values({
          id: upload.documentId,
          orgId: txOrgId,
          engagementId,
          blobKey: upload.blobKey,
          originalFilename: upload.filename,
          fileType: upload.fileType,
          sizeBytes: upload.sizeBytes,
          uploaderUserProfileId: profile.userProfileId,
        })
        .returning({
          id: documents.id,
          filename: documents.originalFilename,
          fileType: documents.fileType,
          sizeBytes: documents.sizeBytes,
        });

      if (tags.length > 0) {
        await tx.insert(documentTags).values(
          tags.map((tag) => ({
            documentId: row.id,
            tag,
            orgId: txOrgId,
          })),
        );
      }

      return row;
    },
    );

    revalidatePath("/portal/documents");
    revalidatePath(`/coach/documents/${engagementId}`);
    return {
      ok: true,
      data: {
        id: created.id,
        filename: created.filename,
        fileType: created.fileType,
        sizeBytes: Number(created.sizeBytes),
      },
    };
  } catch (e) {
    // DB write failed; the blob is orphaned. Best-effort cleanup so we
    // don't leak storage on transient errors.
    try {
      await deleteDocumentBlob(upload.blobKey);
    } catch {
      // Swallow — operator can sweep orphans later.
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ------------------------------- delete ------------------------------- */

export async function deleteDocument(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }

  try {
    const engagementId = await resolveEngagementIdFromRecord(
      "documents",
      id,
    );
    if (!engagementId) {
      return { ok: false, error: "Document not found." };
    }
    const blobKey = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [existing] = await tx
          .select({
            blobKey: documents.blobKey,
            uploaderId: documents.uploaderUserProfileId,
            engagementId: documents.engagementId,
          })
          .from(documents)
          .where(eq(documents.id, id))
          .limit(1);
        if (!existing) throw new Error("Document not found.");

        // Authorization: uploader, master_admin / coach, or
        // client_lead / client_manager. Phase 2 may tighten this.
        const isUploader =
          existing.uploaderId === profile.userProfileId;
        const isLeadership =
          profile.role === "master_admin" ||
          profile.role === "coach" ||
          profile.role === "client_lead" ||
          profile.role === "client_manager";
        if (!isUploader && !isLeadership) {
          throw new Error("You can't delete this document.");
        }

        await tx.delete(documents).where(eq(documents.id, id));
        return {
          blobKey: existing.blobKey,
          engagementId: existing.engagementId,
        };
      },
    );

    // Drop the blob outside the transaction. If this fails we have an
    // orphan blob — non-fatal; surface in logs only.
    try {
      await deleteDocumentBlob(blobKey.blobKey);
    } catch (e) {
      console.error("[documents] failed to delete blob:", e);
    }

    revalidatePath("/portal/documents");
    revalidatePath(`/coach/documents/${blobKey.engagementId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------------- set tags ----------------------------- */

const tagsSchema = z
  .array(z.string().min(1).max(50))
  .max(12, "Maximum 12 tags per document.");

export async function setDocumentTags(
  documentId: string,
  tags: string[],
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(documentId).success) {
    return { ok: false, error: "Invalid id." };
  }
  const parsed = tagsSchema.safeParse(
    tags.map((t) => t.trim()).filter(Boolean),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid tags",
    };
  }
  const cleaned = Array.from(new Set(parsed.data)).slice(0, 12);

  try {
    const lookupEngId = await resolveEngagementIdFromRecord(
      "documents",
      documentId,
    );
    if (!lookupEngId) {
      return { ok: false, error: "Document not found." };
    }
    const engagementId = await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx, boundOrgId) => {
        const [doc] = await tx
          .select({ engagementId: documents.engagementId })
          .from(documents)
          .where(eq(documents.id, documentId))
          .limit(1);
        if (!doc) throw new Error("Document not found.");

        // Replace strategy: drop existing rows, insert the new set.
        await tx
          .delete(documentTags)
          .where(eq(documentTags.documentId, documentId));
        if (cleaned.length > 0) {
          await tx.insert(documentTags).values(
            cleaned.map((tag) => ({
              documentId,
              tag,
              orgId: boundOrgId,
            })),
          );
        }
        return doc.engagementId;
      },
    );

    revalidatePath("/portal/documents");
    revalidatePath(`/coach/documents/${engagementId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------- delete (silent for orphan cleanup) ----------------------- */

/**
 * Remove a document the caller just uploaded but decided to bail on
 * (composer attach picker → user pressed Cancel before sending). No
 * leadership check — we only allow uploader-of-record to undo.
 */
export async function abandonDocument(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }

  try {
    const engagementId = await resolveEngagementIdFromRecord(
      "documents",
      id,
    );
    if (!engagementId) {
      return { ok: true, data: undefined }; // Already gone, no-op.
    }
    const blobKey = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [existing] = await tx
          .select({
            blobKey: documents.blobKey,
            uploaderId: documents.uploaderUserProfileId,
          })
          .from(documents)
          .where(
            and(
              eq(documents.id, id),
              eq(documents.uploaderUserProfileId, profile.userProfileId),
            ),
          )
          .limit(1);
        if (!existing) {
          return null;
        }
        await tx.delete(documents).where(eq(documents.id, id));
        return existing.blobKey;
      },
    );
    if (blobKey) {
      try {
        await deleteDocumentBlob(blobKey);
      } catch (e) {
        console.error("[documents] abandon: blob delete failed:", e);
      }
    }
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ----------------------- batch fetch (used by composer) ----------------------- */

/**
 * Verify a list of document ids belong to the caller's org and the
 * given engagement. Used at message-send time before linking
 * attachments — prevents a tampered client from attaching arbitrary
 * documents to a message.
 */
export async function verifyAttachments(
  engagementId: string,
  documentIds: string[],
): Promise<ActionResult<{ valid: string[] }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (documentIds.length === 0) {
    return { ok: true, data: { valid: [] } };
  }
  try {
    const valid = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const rows = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(
              eq(documents.engagementId, engagementId),
              inArray(documents.id, documentIds),
            ),
          );
        return rows.map((r) => r.id);
      },
    );
    return { ok: true, data: { valid } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
