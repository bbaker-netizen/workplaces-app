/**
 * Google Drive — minimal read-only wrapper.
 *
 * Uses the shared Google OAuth token from lib/integrations/google-calendar.
 * The connection's drive.readonly scope grants enough for what we use:
 * fetch folder metadata, list files inside a folder.
 *
 * No writes ever. The app reads Drive; it never modifies it.
 */

import { getValidAccessToken } from "./google-calendar";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

async function drive<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  webViewLink: string | null;
  iconLink: string | null;
  size: number | null;
  isFolder: boolean;
};

/**
 * Pull a folder's metadata (name + ownership check). Returns null if
 * Drive can't find it or the user doesn't have access — typically
 * means the URL was wrong or the folder isn't shared with them.
 */
export async function getFolderMetadata(
  userProfileId: string,
  folderId: string,
): Promise<{ id: string; name: string } | null> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) {
    throw new Error("Google not connected for this user.");
  }
  try {
    const data = await drive<{
      id: string;
      name: string;
      mimeType: string;
    }>(token.token, `/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType`);
    if (data.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("That ID points to a file, not a folder.");
    }
    return { id: data.id, name: data.name };
  } catch (e) {
    if (e instanceof Error && /404|403/.test(e.message)) {
      return null;
    }
    throw e;
  }
}

/**
 * List files inside the given folder, newest-modified first. Capped at
 * 100 to keep the page snappy — a real client folder rarely needs more,
 * and Bruce can always open it in Drive directly for the full list.
 */
export async function listFolderFiles(
  userProfileId: string,
  folderId: string,
  pageSize = 100,
): Promise<DriveFile[]> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) {
    throw new Error("Google not connected for this user.");
  }
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields:
      "files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size)",
    pageSize: String(pageSize),
    orderBy: "modifiedTime desc",
  });
  const data = await drive<{
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      modifiedTime?: string;
      webViewLink?: string;
      iconLink?: string;
      size?: string;
    }>;
  }>(token.token, `/files?${params.toString()}`);
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime ?? null,
    webViewLink: f.webViewLink ?? null,
    iconLink: f.iconLink ?? null,
    size: f.size ? Number(f.size) : null,
    isFolder: f.mimeType === "application/vnd.google-apps.folder",
  }));
}

/**
 * Extract the folder id from one of the URL shapes Drive uses:
 *   - https://drive.google.com/drive/folders/<id>
 *   - https://drive.google.com/drive/u/0/folders/<id>?usp=…
 *   - https://drive.google.com/open?id=<id>
 *   - a bare id pasted on its own
 */
export function parseDriveFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // /folders/<id> form
  const m1 = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // ?id=<id> form
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  // bare id (Drive ids are typically 28-44 chars of [a-zA-Z0-9_-])
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}
