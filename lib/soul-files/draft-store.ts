/**
 * Status store for the async prospect Soul File draft.
 *
 * The draft is generated in a Netlify Background Function (see
 * netlify/functions/soul-file-draft-background.mts) because it's too slow for
 * a synchronous request. The function writes the result here keyed by
 * prospect id; the UI polls `getSoulFileDraftStatus` until it flips to
 * ready/error. Netlify Blobs (already used for documents) is the store — no DB
 * migration needed for a transient draft. `strong` consistency so the poll
 * never reads a stale "pending" after the write lands.
 */

import { getStore } from "@netlify/blobs";

export type SoulFileDraftStatus =
  | { state: "pending"; startedAt: number }
  | {
      state: "ready";
      body: string;
      transcriptCount: number;
      transcriptTitles: string[];
      finishedAt: number;
    }
  | { state: "error"; error: string; finishedAt: number };

function store() {
  return getStore({ name: "soul-file-drafts", consistency: "strong" });
}

export async function setSoulFileDraftStatus(
  prospectId: string,
  status: SoulFileDraftStatus,
): Promise<void> {
  await store().setJSON(prospectId, status);
}

export async function getSoulFileDraftStatus(
  prospectId: string,
): Promise<SoulFileDraftStatus | null> {
  return (await store().get(prospectId, { type: "json" })) as
    | SoulFileDraftStatus
    | null;
}
