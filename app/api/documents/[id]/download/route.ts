/**
 * Document download streaming.
 *
 * GET /api/documents/:id/download — looks up the document by id (RLS
 * gates the read to the caller's org), pulls the file out of Netlify
 * Blobs, and streams the bytes back with the original filename.
 *
 * Why a server route, not a public Blob URL: tenant isolation. A signed
 * Blob URL would let a recipient pass it around and bypass the RLS
 * policy. Routing through Next.js means every download request runs
 * through `ensureUserProfile` + `withTenantContext`.
 */

import { getDocument } from "@/lib/db/queries/documents";
import { getProspectDocumentForDownload } from "@/lib/db/queries/prospect-documents";
import { downloadDocumentBlob } from "@/lib/storage/blobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  // Engagement documents go through the RLS-scoped getDocument. Prospect
  // (lead) documents have no engagement, so fall back to the Business-
  // Builder-only prospect-document lookup.
  const engagementDoc = await getDocument(params.id);
  const meta = engagementDoc
    ? {
        blobKey: engagementDoc.blobKey,
        filename: engagementDoc.originalFilename,
        fileType: engagementDoc.fileType,
      }
    : await getProspectDocumentForDownload(params.id);
  if (!meta) {
    return new Response("Not found", { status: 404 });
  }

  const blob = await downloadDocumentBlob(meta.blobKey);
  if (!blob) {
    return new Response("File missing on storage.", { status: 410 });
  }

  // Use `attachment` disposition by default — the browser downloads
  // rather than tries to render unfamiliar mime types. Quote-escape
  // the filename per RFC 6266.
  const safeName = meta.filename.replace(/"/g, '\\"');
  return new Response(blob.body, {
    headers: {
      "Content-Type": meta.fileType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
