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
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withTenantContext,
} from "../tenant";
import { ensureUserProfile } from "../provisioning";
import { envelopeRefsForDocuments } from "./document-envelopes";
import type { EnvelopeRole } from "@/lib/documents/presentation";

/**
 * `uploaderName` is nullable because `uploader_user_profile_id` is.
 * Migration 0017 made that column nullable so system flows — the signing
 * flow filing an executed agreement, The Climb ingest — could write a
 * document with no person attached. These queries were never updated to
 * match: they INNER JOINed the uploader, so every one of those documents
 * was silently dropped from the list. A client's own signed contract did
 * not appear on their Documents page at all. Read `origin` for what
 * produced the file; see lib/documents/presentation.ts for the caption.
 */
export type ListedDocument = Document & {
  uploaderName: string | null;
  tags: string[];
  envelopeId: string | null;
  envelopeSubject: string | null;
  envelopeStatus: string | null;
  envelopeRole: EnvelopeRole | null;
};

export async function listEngagementDocuments(
  engagementId: string,
): Promise<ListedDocument[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
    const rows = await tx
      .select({
        document: documents,
        uploaderName: userProfiles.fullName,
      })
      .from(documents)
      // LEFT, not INNER — a document filed by the signing flow has no
      // uploader, and an inner join dropped it from the list entirely.
      .leftJoin(
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

    const envelopeByDoc = await envelopeRefsForDocuments(tx, ids);

    return rows
      .map((r) => ({
        ...r.document,
        uploaderName: r.uploaderName,
        tags: tagsByDoc.get(r.document.id) ?? [],
        envelopeId: envelopeByDoc.get(r.document.id)?.envelopeId ?? null,
        envelopeSubject:
          envelopeByDoc.get(r.document.id)?.envelopeSubject ?? null,
        envelopeStatus:
          envelopeByDoc.get(r.document.id)?.envelopeStatus ?? null,
        envelopeRole: envelopeByDoc.get(r.document.id)?.envelopeRole ?? null,
      }))
      // Reverse-chronological: newest first feels right for a docs feed.
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
    );
  } catch {
    return [];
  }
}

export async function getDocument(
  id: string,
): Promise<ListedDocument | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  const engagementId = await resolveEngagementIdFromRecord("documents", id);
  if (!engagementId) return null;

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [row] = await tx
          .select({
            document: documents,
            uploaderName: userProfiles.fullName,
          })
          .from(documents)
          // LEFT, not INNER — same reason as listEngagementDocuments.
          // With an inner join this returned null for any signed
          // agreement, so the download route fell through to its
          // prospect-only fallback and an engagement-linked signed
          // contract could not be resolved at all.
          .leftJoin(
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

        const env = (await envelopeRefsForDocuments(tx, [id])).get(id) ?? null;

        return {
          ...row.document,
          uploaderName: row.uploaderName,
          tags: tagRows.map((t) => t.tag).sort(),
          envelopeId: env?.envelopeId ?? null,
          envelopeSubject: env?.envelopeSubject ?? null,
          envelopeStatus: env?.envelopeStatus ?? null,
          envelopeRole: env?.envelopeRole ?? null,
        };
      },
    );
  } catch {
    return null;
  }
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
  engagementId?: string,
): Promise<Map<string, AttachedDocument[]>> {
  const result = new Map<string, AttachedDocument[]>();
  if (messageIds.length === 0) return result;

  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return result;

  // Coach cross-org safety: if engagementId is provided, bind RLS to
  // that engagement's org so master_admin / Coach in their home org
  // can read attachments on a client engagement's messages. If absent,
  // fall back to the caller's home org (works only for client roles).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runQuery = async (tx: any) =>
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
      .orderBy(messageAttachments.createdAt);

  type RowShape = {
    messageId: string;
    documentId: string;
    filename: string;
    fileType: string;
    sizeBytes: string | number | bigint;
    createdAt: Date;
  };
  let rows: RowShape[] = [];
  try {
    if (engagementId) {
      rows = await withEngagementContext(
        profile.orgId,
        profile.role,
        engagementId,
        runQuery,
      );
    } else {
      rows = await withTenantContext(profile.orgId, runQuery);
    }
  } catch {
    return result;
  }

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
