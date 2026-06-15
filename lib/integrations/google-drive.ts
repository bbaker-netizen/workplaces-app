/**
 * Google Drive wrapper.
 *
 * Uses the shared Google OAuth token from lib/integrations/google-calendar.
 * Read paths (metadata, listing) plus — with the full `drive` scope — the
 * write paths behind the two-way Documents sync: create a managed folder
 * per engagement and upload files into it.
 */

import { getValidAccessToken } from "./google-calendar";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/** Top-level folder all app-created client folders live under. */
const CLIENTS_PARENT_NAME = "The Builder — Clients";

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
 * Pull a single Drive file's metadata. Used for calendar event
 * attachments — we need name + mimeType + webViewLink to feed to
 * Google Calendar's attachments field. Returns null when the file
 * isn't visible to the caller.
 */
export async function getFileMetadata(
  userProfileId: string,
  fileId: string,
): Promise<{
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  iconLink: string | null;
} | null> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) {
    throw new Error("Google not connected for this user.");
  }
  try {
    const data = await drive<{
      id: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
      iconLink?: string;
    }>(
      token.token,
      `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,iconLink`,
    );
    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      webViewLink: data.webViewLink ?? null,
      iconLink: data.iconLink ?? null,
    };
  } catch (e) {
    if (e instanceof Error && /404|403/.test(e.message)) {
      return null;
    }
    throw e;
  }
}

/* ------------------------------ writes ------------------------------ */

/** Find an existing non-trashed folder by exact name under an optional
 *  parent, or null. Used so we don't create duplicate parent folders. */
async function findFolderByName(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string | null> {
  const safeName = name.replace(/'/g, "\\'");
  const clauses = [
    `name = '${safeName}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const params = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "files(id,name)",
    pageSize: "1",
  });
  const data = await drive<{ files: Array<{ id: string }> }>(
    accessToken,
    `/files?${params.toString()}`,
  );
  return data.files?.[0]?.id ?? null;
}

/** Create a Drive folder, returning its id + webViewLink. */
export async function createDriveFolder(
  userProfileId: string,
  name: string,
  parentId?: string,
): Promise<{ id: string; name: string; webViewLink: string | null }> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) throw new Error("Google not connected for this user.");
  const body: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) body.parents = [parentId];
  const data = await drive<{
    id: string;
    name: string;
    webViewLink?: string;
  }>(token.token, `/files?fields=id,name,webViewLink`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: data.id, name: data.name, webViewLink: data.webViewLink ?? null };
}

/**
 * Ensure the per-engagement managed folder exists under the shared
 * "The Builder — Clients" parent, reusing it if already present. Returns
 * the folder id + name + link.
 */
export async function ensureManagedClientFolder(
  userProfileId: string,
  clientName: string,
): Promise<{ id: string; name: string; webViewLink: string | null }> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) throw new Error("Google not connected for this user.");
  // Parent ("The Builder — Clients") — reuse or create.
  let parentId = await findFolderByName(token.token, CLIENTS_PARENT_NAME);
  if (!parentId) {
    parentId = (await createDriveFolder(userProfileId, CLIENTS_PARENT_NAME)).id;
  }
  // Client folder under the parent — reuse or create.
  const existing = await findFolderByName(token.token, clientName, parentId);
  if (existing) {
    const meta = await getFolderMetadata(userProfileId, existing);
    return {
      id: existing,
      name: meta?.name ?? clientName,
      webViewLink: `https://drive.google.com/drive/folders/${existing}`,
    };
  }
  return createDriveFolder(userProfileId, clientName, parentId);
}

/**
 * Upload a file into a Drive folder via the multipart endpoint. Returns
 * the new file's id + webViewLink.
 */
export async function uploadFileToDrive(
  userProfileId: string,
  folderId: string,
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<{ id: string; webViewLink: string | null }> {
  const token = await getValidAccessToken(userProfileId);
  if (!token) throw new Error("Google not connected for this user.");

  const boundary = `builder-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive upload ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { id: string; webViewLink?: string };
  return { id: json.id, webViewLink: json.webViewLink ?? null };
}

/**
 * Extract a file id from one of the Drive URL shapes:
 *   - https://drive.google.com/file/d/<id>/view
 *   - https://docs.google.com/document/d/<id>/edit
 *   - https://docs.google.com/spreadsheets/d/<id>/edit
 *   - https://docs.google.com/presentation/d/<id>/edit
 *   - https://drive.google.com/open?id=<id>
 *   - a bare id
 */
export function parseDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m1 = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
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
