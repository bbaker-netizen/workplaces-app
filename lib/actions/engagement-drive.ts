"use server";

/**
 * Link/unlink a Google Drive folder to an engagement. The engagement
 * documents page then mirrors the folder's files (read-only) alongside
 * documents uploaded into the app.
 */

import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements } from "@/lib/db/schema";
import { withEngagementContext, withSystemContext } from "@/lib/db/tenant";
import {
  ensureManagedClientFolder,
  getFolderMetadata,
  listDriveFolders,
  parseDriveFolderId,
} from "@/lib/integrations/google-drive";

/** Normalise a name for fuzzy folder↔engagement matching. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop "(Demo)" etc.
    .replace(
      /\b(demo|client|clients|files|folder|the|builder|inc|llc|ltd|co|corp|company)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type DriveFolderMatch = {
  engagementId: string;
  engagementName: string;
  alreadyLinked: boolean;
  suggestion: { folderId: string; folderName: string } | null;
};

/**
 * Scan the coach's Drive folders and suggest a match for each engagement
 * by name. Coach-only. Returns one row per active engagement with its
 * best folder suggestion (or null), so the coach can bulk-link existing
 * client folders instead of pasting URLs one by one.
 */
export async function scanDriveFolderMatches(): Promise<
  | { ok: true; matches: DriveFolderMatch[] }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }

  let folders: Array<{ id: string; name: string }>;
  try {
    folders = await listDriveFolders(profile.userProfileId);
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Drive: ${e.message}`
          : "Couldn't read your Drive folders.",
    };
  }

  const engs = await withSystemContext(async (tx) =>
    tx
      .select({
        id: engagements.id,
        name: engagements.name,
        folderId: engagements.googleDriveFolderId,
      })
      .from(engagements)
      .where(isNull(engagements.archivedAt)),
  );

  const normedFolders = folders.map((f) => ({ ...f, n: norm(f.name) }));

  const matches: DriveFolderMatch[] = engs.map((e) => {
    const name = e.name ?? "Engagement";
    const en = norm(name);
    let suggestion: { folderId: string; folderName: string } | null = null;
    if (en) {
      // Prefer an exact normalised match, else a containment either way.
      const exact = normedFolders.find((f) => f.n === en);
      const partial =
        exact ??
        normedFolders.find(
          (f) => f.n && (f.n.includes(en) || en.includes(f.n)),
        );
      if (partial) {
        suggestion = { folderId: partial.id, folderName: partial.name };
      }
    }
    return {
      engagementId: e.id,
      engagementName: name,
      alreadyLinked: Boolean(e.folderId),
      suggestion,
    };
  });

  return { ok: true, matches };
}

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
    revalidatePath(`/business-builder/documents/${parsed.data.engagementId}`);
    return { ok: true, folderName: meta.name, folderId: meta.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}

/**
 * Create an app-managed Drive folder for the engagement (full two-way).
 * Creates `The Builder — Clients / <Client Name>` in the coach's Drive,
 * reusing it if it already exists, and marks the engagement managed so
 * uploads mirror into it. Coach-only.
 */
export async function createManagedDriveFolder(
  engagementId: string,
): Promise<
  | { ok: true; folderName: string; folderId: string }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  if (!z.string().uuid().safeParse(engagementId).success) {
    return { ok: false, error: "Invalid id." };
  }

  // Resolve a human name for the folder from the engagement / client org.
  let clientName = "Client";
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [eng] = await tx
          .select({ name: engagements.name })
          .from(engagements)
          .where(eq(engagements.id, engagementId))
          .limit(1);
        if (eng?.name) clientName = eng.name;
      },
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  let folder: { id: string; name: string };
  try {
    folder = await ensureManagedClientFolder(profile.userProfileId, clientName);
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Drive: ${e.message}`
          : "Couldn't create the Drive folder.",
    };
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
            googleDriveFolderId: folder.id,
            googleDriveFolderName: folder.name,
            googleDriveManaged: true,
            googleDriveLinkedByUserProfileId: profile.userProfileId,
            googleDriveLinkedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(engagements.id, engagementId));
      },
    );
    revalidatePath(`/business-builder/documents/${engagementId}`);
    revalidatePath("/portal/documents");
    return { ok: true, folderName: folder.name, folderId: folder.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
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
    revalidatePath(`/business-builder/documents/${engagementId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Server error.",
    };
  }
}
