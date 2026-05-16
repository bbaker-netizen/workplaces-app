"use server";

/**
 * Link/unlink a Google Drive folder to an engagement. The engagement
 * documents page then mirrors the folder's files (read-only) alongside
 * documents uploaded into the app.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements } from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";
import {
  getFolderMetadata,
  parseDriveFolderId,
} from "@/lib/integrations/google-drive";

const linkSchema = z.object({
  engagementId: z.string().uuid(),
  /** A Drive folder URL or bare id. The action parses the URL shapes
   *  Drive uses (`/folders/<id>`, `?id=<id>`, or a bare id). */
  folderUrlOrId: z.string().min(8).max(500),
});

export async function linkEngagementDriveFolder(
  input: z.input<typeof linkSchema>,
): Promise<
  | { ok: true; folderName: string; folderId: string }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const folderId = parseDriveFolderId(parsed.data.folderUrlOrId);
  if (!folderId) {
    return {
      ok: false,
      error:
        "Couldn't find a folder ID in that. Paste the share URL from Drive — looks like /folders/<id>.",
    };
  }

  // Verify the folder exists and we have access.
  let meta: { id: string; name: string } | null;
  try {
    meta = await getFolderMetadata(profile.userProfileId, folderId);
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Drive: ${e.message}`
          : "Drive isn't reachable right now.",
    };
  }
  if (!meta) {
    return {
      ok: false,
      error:
        "Drive can't see that folder. Make sure it's shared with your Google account, or that you own it.",
    };
  }

  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      parsed.data.engagementId,
      async (tx) => {
        await tx
          .update(engagements)
          .set({
            googleDriveFolderId: meta!.id,
            googleDriveFolderName: meta!.name,
            googleDriveLinkedByUserProfileId: profile.userProfileId,
            googleDriveLinkedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(engagements.id, parsed.data.engagementId));
      },
    );
    revalidatePath(`/coach/documents/${parsed.data.engagementId}`);
    return { ok: true, folderName: meta.name, folderId: meta.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

export async function unlinkEngagementDriveFolder(
  engagementId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (!z.string().uuid().safeParse(engagementId).success) {
    return { ok: false, error: "Invalid id." };
  }
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .update(engagements)
          .set({
            googleDriveFolderId: null,
            googleDriveFolderName: null,
            googleDriveLinkedByUserProfileId: null,
            googleDriveLinkedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(engagements.id, engagementId));
      },
    );
    revalidatePath(`/coach/documents/${engagementId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}
