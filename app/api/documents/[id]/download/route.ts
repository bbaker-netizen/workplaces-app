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
import { downloadDocumentBlob } from "@/lib/storage/blobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const doc = await getDocument(params.id);
  if (!doc) {
    return new Response("Not found", { status: 404 });
  }

  const blob = await downloadDocumentBlob(doc.blobKey);
  if (!blob) {
    return new Response("File missing on storage.", { status: 410 });
  }

  // Use `attachment` disposition by default — the browser downloads
  // rather than tries to render unfamiliar mime types. Quote-escape
  // the filename per RFC 6266.
  const safeName = doc.originalFilename.replace(/"/g, '\\"');
  return new Response(blob.body, {
    headers: {
      "Content-Type": doc.fileType || "application/octet-stream",
      "Content-Length": String(doc.sizeBytes),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
