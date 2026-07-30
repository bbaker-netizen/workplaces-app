/**
 * Reading PDF markup.
 *
 * Markup is scoped to engagement documents only. A document attached to a
 * prospect rather than an engagement (a contract sent before they signed) has
 * no engagement to resolve, and therefore no access rule to check — deciding
 * who may mark those up is a separate authorization question, so the editor
 * declines them rather than inventing an answer here. `getDocument` already
 * behaves the same way for the same reason.
 */

import { asc, eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { documentAnnotations, documents } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import {
  isAnnotationKind,
  type MarkupAnnotation,
  type NormalizedPoint,
} from "@/lib/pdf/annotations";

export type MarkupDocument = {
  id: string;
  engagementId: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  version: number;
};

/**
 * The document plus its markup, in one bound transaction.
 *
 * Returns null for anything the caller cannot reach — `withEngagementContext`
 * enforces the per-Business-Builder client grants, so a coach restricted to
 * their own book cannot open another coach's client document by pasting an id.
 */
export async function getMarkupDocument(documentId: string): Promise<{
  document: MarkupDocument;
  annotations: MarkupAnnotation[];
} | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;

  const engagementId = await resolveEngagementIdFromRecord(
    "documents",
    documentId,
  );
  if (!engagementId) return null;

  try {
    return await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [doc] = await tx
          .select({
            id: documents.id,
            engagementId: documents.engagementId,
            filename: documents.originalFilename,
            fileType: documents.fileType,
            sizeBytes: documents.sizeBytes,
            version: documents.version,
          })
          .from(documents)
          .where(eq(documents.id, documentId))
          .limit(1);
        if (!doc || !doc.engagementId) return null;

        const rows = await tx
          .select()
          .from(documentAnnotations)
          .where(eq(documentAnnotations.documentId, documentId))
          // Creation order IS paint order: later markup draws on top, so a
          // whiteout added after a highlight covers it in both the editor and
          // the burned output.
          .orderBy(asc(documentAnnotations.createdAt));

        return {
          document: {
            id: doc.id,
            engagementId: doc.engagementId,
            filename: doc.filename,
            fileType: doc.fileType,
            sizeBytes: Number(doc.sizeBytes),
            version: Number(doc.version),
          },
          annotations: rows.map(toMarkup),
        };
      },
    );
  } catch {
    // withEngagementContext throws on an access failure. Null reads as "not
    // found" to the caller, which is the right thing to show either way.
    return null;
  }
}

/** Row to the shape both the editor and the burn step speak. */
export function toMarkup(row: {
  id: string;
  pageNumber: number;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  points: unknown;
  body: string | null;
  color: string;
  fontSize: number | null;
  strokeWidth: number | null;
  opacity: number | null;
  imageData: string | null;
}): MarkupAnnotation {
  return {
    id: row.id,
    pageNumber: row.pageNumber,
    // A kind written by an older or newer build falls back to a plain box
    // rather than being dropped — visible and harmless beats invisible.
    kind: isAnnotationKind(row.kind) ? row.kind : "box",
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    points: Array.isArray(row.points)
      ? (row.points as NormalizedPoint[])
      : null,
    body: row.body,
    color: row.color,
    fontSize: row.fontSize,
    strokeWidth: row.strokeWidth,
    opacity: row.opacity,
    imageData: row.imageData,
  };
}
