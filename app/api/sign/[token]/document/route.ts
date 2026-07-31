/**
 * Public source-document download for the signing page.
 *
 * Phase 4.5. Streams the source PDF (or whatever file type) to the
 * signer's browser so the /sign/[token] page can embed it. Auth is
 * the token itself — anyone with the link can fetch the document
 * exactly as they'll be signing it.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  documents,
  signatureEnvelopes,
  signatureSigners,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { downloadDocumentBlob } from "@/lib/storage/blobs";
import {
  contentDisposition,
  safeContentType,
} from "@/lib/http/content-disposition";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
): Promise<Response> {
  const ctx = await withSystemContext(async (tx) => {
    const [signer] = await tx
      .select({
        id: signatureSigners.id,
        envelopeId: signatureSigners.envelopeId,
      })
      .from(signatureSigners)
      .where(eq(signatureSigners.publicToken, params.token))
      .limit(1);
    if (!signer) return null;
    const [env] = await tx
      .select({
        sourceDocumentId: signatureEnvelopes.sourceDocumentId,
        status: signatureEnvelopes.status,
      })
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, signer.envelopeId))
      .limit(1);
    if (!env) return null;
    const [doc] = await tx
      .select({
        blobKey: documents.blobKey,
        originalFilename: documents.originalFilename,
        fileType: documents.fileType,
      })
      .from(documents)
      .where(eq(documents.id, env.sourceDocumentId))
      .limit(1);
    if (!doc) return null;
    return doc;
  });
  if (!ctx) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const blob = await downloadDocumentBlob(ctx.blobKey);
  if (!blob) {
    return NextResponse.json(
      { error: "Document file missing." },
      { status: 404 },
    );
  }

  // `inline` — the signing page embeds this in a PDF object so the signer
  // reads what they are signing without downloading it first.
  //
  // This one never threw, because percent-encoding the whole filename
  // makes it ASCII. It was wrong in the other direction: a signer who
  // saved the document got "Business%20building%20agreement%20%E2%80%94"
  // as its name. `contentDisposition` emits a readable ASCII fallback
  // plus the properly encoded real name.
  const arrayBuffer = blob.body;
  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": safeContentType(ctx.fileType),
      "Content-Disposition": contentDisposition(ctx.originalFilename, "inline"),
      "Cache-Control": "private, no-store",
    },
  });
}
