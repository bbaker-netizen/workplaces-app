/**
 * The Climb → The Builder ingest.
 *
 * The Climb app POSTs the PDF it generates (plus the prospect_id we passed
 * into it) here, and we file it on that prospect's record — a `documents`
 * row + a timeline entry — so every Climb result is kept whether or not the
 * lead ever converts.
 *
 * Auth: Bearer `THE_CLIMB_INGEST_SECRET` (shared with The Climb).
 * Body: multipart/form-data with `prospect_id` and `file` (the PDF).
 *
 * CORS: The Climb is a separate origin, so we answer the browser preflight
 * and echo the allowed origin.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { documents, prospectActivities, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { deleteDocumentBlob, uploadDocumentBlob } from "@/lib/storage/blobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

function corsHeaders(): Record<string, string> {
  const origin =
    process.env.NEXT_PUBLIC_THE_CLIMB_URL?.replace(/\/+$/, "") ||
    "https://workplaces-the-climb.netlify.app";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const headers = corsHeaders();
  const expected = process.env.THE_CLIMB_INGEST_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "THE_CLIMB_INGEST_SECRET not configured." },
      { status: 500, headers },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400, headers },
    );
  }
  const prospectId = String(form.get("prospect_id") ?? "").trim();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  if (!prospectId) {
    return NextResponse.json(
      { error: "Missing prospect_id." },
      { status: 400, headers },
    );
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Missing file." },
      { status: 400, headers },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 25 MB." },
      { status: 413, headers },
    );
  }

  try {
    const orgId = await withSystemContext(async (tx) => {
      const [p] = await tx
        .select({ orgId: prospects.orgId })
        .from(prospects)
        .where(eq(prospects.id, prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");
      return p.orgId;
    });

    const upload = await uploadDocumentBlob(orgId, file);
    try {
      const documentId = await withSystemContext(async (tx) => {
        const [row] = await tx
          .insert(documents)
          .values({
            id: upload.documentId,
            orgId,
            prospectId,
            blobKey: upload.blobKey,
            originalFilename: upload.filename,
            fileType: upload.fileType,
            sizeBytes: upload.sizeBytes,
            uploaderUserProfileId: null,
          })
          .returning({ id: documents.id });
        await tx.insert(prospectActivities).values({
          prospectId,
          orgId,
          type: "document",
          subject: title || `The Climb: ${upload.filename}`,
        });
        return row.id;
      });
      return NextResponse.json(
        { ok: true, documentId },
        { status: 201, headers },
      );
    } catch (e) {
      await deleteDocumentBlob(upload.blobKey).catch(() => {});
      throw e;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers },
    );
  }
}
