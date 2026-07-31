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
import {
  contentDisposition,
  safeContentType,
} from "@/lib/http/content-disposition";

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

  // A storage failure used to surface as an unhandled throw, i.e. a bare
  // 500 with nothing in it. Say which half broke — the file is missing
  // from storage, as opposed to the caller not being allowed to see it.
  let blob;
  try {
    blob = await downloadDocumentBlob(meta.blobKey);
  } catch (e) {
    console.error(
      `[documents] blob read failed for ${params.id} (${meta.blobKey}):`,
      e,
    );
    return new Response("Could not read the file from storage.", {
      status: 502,
    });
  }
  if (!blob) {
    return new Response("File missing on storage.", { status: 410 });
  }

  // Use `attachment` disposition by default — the browser downloads
  // rather than tries to render unfamiliar mime types.
  //
  // `contentDisposition` is what stops a non-ASCII filename throwing on
  // the way into the header. Every signed agreement is named
  // "… — signed.pdf", and the em dash in that suffix made this route
  // return 500 for the one document that mattered most. See the header
  // comment in lib/http/content-disposition.ts.
  return new Response(blob.body, {
    headers: {
      "Content-Type": safeContentType(meta.fileType),
      "Content-Disposition": contentDisposition(meta.filename),
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
