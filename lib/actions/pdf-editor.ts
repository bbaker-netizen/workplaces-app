"use server";

/**
 * Export and page editing — the two operations that write a new PDF.
 *
 * Both file their output as a NEW VERSION of the document rather than
 * replacing it. Nothing here can destroy an original, which is what makes the
 * editor safe to point at a signed contract.
 *
 * PAGE OPERATIONS BURN EXISTING MARKUP FIRST, and this is the load-bearing
 * decision in the file. Annotations carry a page number. Delete page 3 and
 * every mark on pages 4-plus is suddenly attached to the wrong page; reorder
 * and they scatter. The options were to remap coordinates (only correct for
 * reorder, and silently wrong for the rest), to refuse page ops while markup
 * exists (annoying and arbitrary), or to bake the markup down before changing
 * the page set. Burning is the only one of the three that cannot misplace a
 * mark: the markup becomes part of the page, so it travels with it.
 *
 * The new version therefore starts with no annotation rows, and the previous
 * version keeps both its file and its editable markup.
 *
 * Neither operation needs a background function. pdf-lib rewrites object
 * streams rather than rasterizing pages, so both finish in well under a
 * second for documents inside the 25 MB storage cap — nowhere near the ~26s
 * synchronous ceiling that pushed transcript drafting into a background
 * function.
 */

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { toMarkup } from "@/lib/db/queries/document-annotations";
import { documentAnnotations, documents } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import {
  editedFilename,
  fileNewDocumentVersion,
} from "@/lib/documents/new-version";
import { burnAnnotations } from "@/lib/pdf/burn";
import { applyPageOps, type PageOp } from "@/lib/pdf/page-ops";
import { downloadDocumentBlob } from "@/lib/storage/blobs";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type EditedDocument = {
  id: string;
  version: number;
  filename: string;
};

const pageOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("delete"),
    pages: z.array(z.number().int().min(1)).min(1).max(5000),
  }),
  z.object({
    type: z.literal("rotate"),
    pages: z.array(z.number().int().min(1)).min(1).max(5000),
    turn: z.union([z.literal(90), z.literal(180), z.literal(270)]),
  }),
  z.object({
    type: z.literal("reorder"),
    order: z.array(z.number().int().min(1)).min(1).max(5000),
  }),
  z.object({
    type: z.literal("extract"),
    pages: z.array(z.number().int().min(1)).min(1).max(5000),
  }),
]);

/**
 * Everything the write paths need, gathered under one access check.
 *
 * `blobKey` never leaves the server — it is the storage address, and the
 * download route exists precisely so bytes are only ever served through an
 * authenticated boundary.
 */
async function loadForEdit(documentId: string) {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false as const, error: "Not authenticated." };
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false as const, error: "PDF editing is for Business Builders." };
  }
  if (!z.string().uuid().safeParse(documentId).success) {
    return { ok: false as const, error: "Invalid document id." };
  }

  const engagementId = await resolveEngagementIdFromRecord(
    "documents",
    documentId,
  );
  if (!engagementId) {
    return {
      ok: false as const,
      error: "PDF editing is only available on engagement documents.",
    };
  }

  try {
    // withEngagementContext enforces the per-Business-Builder client grants.
    const loaded = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [doc] = await tx
          .select({
            id: documents.id,
            blobKey: documents.blobKey,
            filename: documents.originalFilename,
            fileType: documents.fileType,
          })
          .from(documents)
          .where(eq(documents.id, documentId))
          .limit(1);
        if (!doc) return null;

        const rows = await tx
          .select()
          .from(documentAnnotations)
          .where(eq(documentAnnotations.documentId, documentId))
          .orderBy(asc(documentAnnotations.createdAt));

        return { doc, annotations: rows.map(toMarkup) };
      },
    );
    if (!loaded) return { ok: false as const, error: "Document not found." };

    const isPdf =
      loaded.doc.fileType.toLowerCase().includes("pdf") ||
      /\.pdf$/i.test(loaded.doc.filename);
    if (!isPdf) {
      return { ok: false as const, error: "That document isn't a PDF." };
    }

    return {
      ok: true as const,
      profile,
      engagementId,
      doc: loaded.doc,
      annotations: loaded.annotations,
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function readBytes(blobKey: string): Promise<Uint8Array> {
  const blob = await downloadDocumentBlob(blobKey);
  if (!blob) throw new Error("The stored file is missing.");
  return new Uint8Array(blob.body);
}

/**
 * Flatten the markup into a new version.
 *
 * Flattened rather than saved as native PDF annotations, so the marked-up copy
 * reads identically in Preview, a phone mail client and a printer — and so a
 * recipient cannot drag the notes around. The editable copy remains the rows
 * on the previous version.
 */
export async function exportMarkedUpPdf(
  documentId: string,
): Promise<ActionResult<EditedDocument & { skipped: number }>> {
  const loaded = await loadForEdit(documentId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { profile, engagementId, doc, annotations } = loaded;

  if (annotations.length === 0) {
    return { ok: false, error: "There's no markup on this document yet." };
  }

  try {
    const source = await readBytes(doc.blobKey);
    const burned = await burnAnnotations(source, annotations);
    const filed = await fileNewDocumentVersion({
      callerOrgId: profile.orgId,
      callerRole: profile.role,
      engagementId,
      parentDocumentId: doc.id,
      bytes: burned.bytes,
      filename: editedFilename(doc.filename, "marked up"),
      uploaderUserProfileId: profile.userProfileId,
    });

    revalidatePath(`/business-builder/documents/${engagementId}`);
    return { ok: true, data: { ...filed, skipped: burned.skipped } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Apply page operations, producing a new version.
 *
 * Ops run in the order given, and each one's page numbers refer to the
 * document as it stands after the previous op — which is what a person means
 * by "drop page 2, then rotate page 4".
 */
export async function applyPdfPageOps(
  documentId: string,
  ops: PageOp[],
): Promise<ActionResult<EditedDocument & { pageCount: number }>> {
  const loaded = await loadForEdit(documentId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { profile, engagementId, doc, annotations } = loaded;

  const parsed = z.array(pageOpSchema).min(1).max(20).safeParse(ops);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Those page changes aren't valid.",
    };
  }

  try {
    const source = await readBytes(doc.blobKey);

    // Bake markup down first — see the file header for why this is not
    // optional.
    const base =
      annotations.length > 0
        ? (await burnAnnotations(source, annotations)).bytes
        : source;

    const result = await applyPageOps(base, parsed.data);
    const filed = await fileNewDocumentVersion({
      callerOrgId: profile.orgId,
      callerRole: profile.role,
      engagementId,
      parentDocumentId: doc.id,
      bytes: result.bytes,
      filename: editedFilename(doc.filename, describeOps(parsed.data)),
      uploaderUserProfileId: profile.userProfileId,
    });

    revalidatePath(`/business-builder/documents/${engagementId}`);
    return { ok: true, data: { ...filed, pageCount: result.pageCount } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A short, human filename suffix describing what was done. */
function describeOps(ops: PageOp[]): string {
  if (ops.length > 1) return "edited";
  const op = ops[0];
  switch (op.type) {
    case "delete":
      return op.pages.length === 1
        ? `page ${op.pages[0]} removed`
        : "pages removed";
    case "rotate":
      return "rotated";
    case "reorder":
      return "reordered";
    case "extract":
      return op.pages.length === 1
        ? `page ${op.pages[0]}`
        : `${op.pages.length} pages extracted`;
  }
}

/**
 * The signature image the current Business Builder has stored, for stamping
 * onto a page. Read through the existing profile column rather than asking for
 * an upload again, so the mark matches what the signing flow already uses.
 */
export async function getMyStampImage(): Promise<ActionResult<string | null>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "PDF editing is for Business Builders." };
  }
  try {
    const { withSystemContext } = await import("@/lib/db/tenant");
    const { userProfiles } = await import("@/lib/db/schema");
    const data = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ signatureImageData: userProfiles.signatureImageData })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);
      return row?.signatureImageData ?? null;
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
