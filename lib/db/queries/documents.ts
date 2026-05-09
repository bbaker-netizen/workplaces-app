/**
 * Documents — read queries (server-side only).
 *
 * Mutations live in `lib/actions/documents.ts`.
 *
 * Three surfaces:
 *
 *   - `listEngagementDocuments(engagementId)` — every file uploaded
 *     to an engagement, with uploader name and tag chips. Used by
 *     the Documents page.
 *   - `getDocument(id)` — single document with download metadata.
 *     Used by the download route handler before streaming bytes.
 *   - `listAttachmentsForMessages(messageIds)` — batched, returns a
 *     Map keyed by message id (same pattern as `listReactionsForMessages`).
 *     Used by the thread renderer to attach chips to each message row.
 */

import { eq, inArray } from "drizzle-orm";
import {
  documentTags,
  documents,
  messageAttachments,
  userProfiles,
  type Document,
} from "../schema";
import { withTenantContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

export type ListedDocument = Document & {
  uploaderName: string;
  tags: string[];
};

export async function listEngagementDocuments(
  engagementId: string,
): Promise<ListedDocument[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  return withTenantContext(profile.orgId, async (tx) => {
    const rows = await tx
      .select({
        document: documents,
        uploaderName: userProfiles.fullName,
      })
      .from(documents)
      .innerJoin(
        userProfiles,
        eq(userProfiles.id, documents.uploaderUserProfileId),
      )
      .where(eq(documents.engagementId, engagementId))
      .orderBy(documents.createdAt);

    if (rows.length === 0) return [];

    // Batch-load tags for all documents in one query.
    const ids = rows.map((r) => r.document.id);
    const tagRows = await tx
      .select({
        documentId: documentTags.documentId,
        tag: documentTags.tag,
      })
      .from(documentTags)
      .where(inArray(documentTags.documentId, ids));

    const tagsByDoc = new Map<string, string[]>();
    for (const row of tagRows) {
      let bucket = tagsByDoc.get(row.documentId);
      if (!bucket) {
        bucket = [];
        tagsByDoc.set(row.documentId, bucket);
      }
      bucket.push(row.tag);
    }
    tagsByDoc.forEach((arr) => arr.sort());

    return rows
      .map((r) => ({
        ...r.document,
        uploaderName: r.uploaderName,
        tags: tagsByDoc.get(r.document.id) ?? [],
      }))
      // Reverse-chronological: newest first feels right for a docs feed.
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
}

export async function getDocument(
  id: string,
): Promise<ListedDocument | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  return withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .select({
        document: documents,
        uploaderName: userProfiles.fullName,
      })
      .from(documents)
      .innerJoin(
        userProfiles,
        eq(userProfiles.id, documents.uploaderUserProfileId),
      )
      .where(eq(documents.id, id))
      .limit(1);
    if (!row) return null;

    const tagRows = await tx
      .select({ tag: documentTags.tag })
      .from(documentTags)
      .where(eq(documentTags.documentId, id));

    return {
      ...row.document,
      uploaderName: row.uploaderName,
      tags: tagRows.map((t) => t.tag).sort(),
    };
  });
}

/* ------------------------- message attachments ------------------------- */

export type AttachedDocument = {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
};

export async function listAttachmentsForMessages(
  messageIds: string[],
): Promise<Map<string, AttachedDocument[]>> {
  const result = new Map<string, AttachedDocument[]>();
  if (messageIds.length === 0) return result;

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return result;

  const rows = await withTenantContext(profile.orgId, async (tx) =>
    tx
      .select({
        messageId: messageAttachments.messageId,
        documentId: documents.id,
        filename: documents.originalFilename,
        fileType: documents.fileType,
        sizeBytes: documents.sizeBytes,
        createdAt: messageAttachments.createdAt,
      })
      .from(messageAttachments)
      .innerJoin(
        documents,
        eq(documents.id, messageAttachments.documentId),
      )
      .where(inArray(messageAttachments.messageId, messageIds))
      .orderBy(messageAttachments.createdAt),
  );

  for (const row of rows) {
    let bucket = result.get(row.messageId);
    if (!bucket) {
      bucket = [];
      result.set(row.messageId, bucket);
    }
    bucket.push({
      id: row.documentId,
      filename: row.filename,
      fileType: row.fileType,
      sizeBytes: Number(row.sizeBytes),
    });
  }
  return result;
}
