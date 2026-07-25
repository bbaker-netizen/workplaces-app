"use server";

/**
 * List the documents a Business Builder can attach to an outgoing email —
 * the files already on the prospect (e.g. the Climb PDF that gets ingested
 * after the assessment) or on the engagement. Powers the composer's
 * "Attach from this client's documents" picker.
 */

import { ensureUserProfile } from "@/lib/db/provisioning";
import { listProspectDocuments } from "@/lib/db/queries/prospect-documents";
import { listEngagementDocuments } from "@/lib/db/queries/documents";

export type AttachableDocument = {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
};

export type ListAttachableResult =
  | { ok: true; documents: AttachableDocument[] }
  | { ok: false; error: string };

export async function listAttachableDocuments(input: {
  prospectId?: string | null;
  engagementId?: string | null;
}): Promise<ListAttachableResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }

  if (input.prospectId) {
    const docs = await listProspectDocuments(input.prospectId);
    return {
      ok: true,
      documents: docs.map((d) => ({
        id: d.id,
        filename: d.filename,
        fileType: d.fileType,
        sizeBytes: d.sizeBytes,
      })),
    };
  }

  if (input.engagementId) {
    // listEngagementDocuments enforces the caller's access to the engagement.
    const docs = await listEngagementDocuments(input.engagementId);
    return {
      ok: true,
      documents: docs.map((d) => ({
        id: d.id,
        filename: d.originalFilename,
        fileType: d.fileType,
        sizeBytes: d.sizeBytes,
      })),
    };
  }

  return { ok: true, documents: [] };
}
