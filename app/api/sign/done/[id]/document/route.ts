/**
 * Public signed-agreement download for the completion page.
 *
 * Sibling of `/api/sign/[token]/document`, which serves the document BEFORE
 * signing. This serves the finished, executed copy afterwards, so the link in
 * the completion email leads somewhere real.
 *
 * Auth is the same standard as the rest of the signing flow: the id is a v4
 * UUID emailed only to that envelope's signers. It is additionally checked to
 * be the SIGNED output of a COMPLETED envelope — the id of any other document
 * in the system won't serve, so this can't become a way to pull arbitrary
 * files.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { documents, signatureEnvelopes } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { downloadDocumentBlob } from "@/lib/storage/blobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const doc = await withSystemContext(async (tx) => {
    const [env] = await tx
      .select({ status: signatureEnvelopes.status })
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.signedDocumentId, params.id))
      .limit(1);
    if (!env || env.status !== "completed") return null;
    const [row] = await tx
      .select({
        blobKey: documents.blobKey,
        originalFilename: documents.originalFilename,
        fileType: documents.fileType,
      })
      .from(documents)
      .where(eq(documents.id, params.id))
      .limit(1);
    return row ?? null;
  });

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blob = await downloadDocumentBlob(doc.blobKey);
  if (!blob) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  return new Response(new Uint8Array(blob.body), {
    headers: {
      "Content-Type": doc.fileType || "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.originalFilename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
