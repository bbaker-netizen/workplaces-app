"use server";

/**
 * Prospect Soul File draft — async.
 *
 * Lets a Business Builder see the Soul File Claude would build for a prospect
 * from their Fireflies recordings, WITHOUT formalising them into an engagement
 * first. The generation (paginating Fireflies + pulling transcripts + a big
 * Claude call) is far too slow for a synchronous request — it was timing out
 * with "took too long or the connection dropped". So `startSoulFileDraft`
 * fires a Netlify Background Function and returns immediately; the drawer polls
 * `getSoulFileDraftResult` until the draft (or an error) lands in the store.
 *
 * Authz: master_admin / Coach only.
 */

import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getProspect } from "@/lib/db/queries/prospects";
import {
  getSoulFileDraftStatus,
  setSoulFileDraftStatus,
  type SoulFileDraftStatus,
} from "@/lib/soul-files/draft-store";

const schema = z.object({ prospectId: z.string().uuid() });

export type StartSoulFileResult =
  | { ok: true }
  | { ok: false; error: string; kind?: "missing_key" | "auth" | "not_found" };

export async function startSoulFileDraft(input: {
  prospectId: string;
}): Promise<StartSoulFileResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not signed in.", kind: "auth" };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only.", kind: "auth" };

  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  const { prospectId } = parsed.data;

  // Fast, clear failures up front — no point spending a background run.
  if (!process.env.FIREFLIES_API_KEY)
    return {
      ok: false,
      error: "FIREFLIES_API_KEY isn't set in Netlify.",
      kind: "missing_key",
    };
  if (!process.env.ANTHROPIC_API_KEY)
    return {
      ok: false,
      error: "ANTHROPIC_API_KEY isn't set in Netlify.",
      kind: "missing_key",
    };
  const baseUrl =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret)
    return {
      ok: false,
      error:
        "Background drafting isn't configured on the server (missing URL or CRON_SECRET).",
      kind: "missing_key",
    };

  const prospect = await getProspect(prospectId);
  if (!prospect) return { ok: false, error: "Prospect not found.", kind: "not_found" };

  // Mark pending BEFORE firing so the first poll never mistakes "no record yet"
  // for "done", and fire the background function.
  await setSoulFileDraftStatus(prospectId, {
    state: "pending",
    startedAt: Date.now(),
  });
  try {
    const resp = await fetch(
      `${baseUrl}/.netlify/functions/soul-file-draft-background`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prospectId }),
      },
    );
    if (resp.status !== 202 && !resp.ok) {
      const msg = `Couldn't start the draft (HTTP ${resp.status}).`;
      await setSoulFileDraftStatus(prospectId, {
        state: "error",
        error: msg,
        finishedAt: Date.now(),
      });
      return { ok: false, error: msg };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setSoulFileDraftStatus(prospectId, {
      state: "error",
      error: msg,
      finishedAt: Date.now(),
    });
    return { ok: false, error: msg };
  }

  return { ok: true };
}

export type SoulFileDraftPoll =
  | { ok: true; status: SoulFileDraftStatus | { state: "pending" } }
  | { ok: false; error: string };

/** Poll target for the drawer. Returns the current draft status. */
export async function getSoulFileDraftResult(input: {
  prospectId: string;
}): Promise<SoulFileDraftPoll> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const status = await getSoulFileDraftStatus(parsed.data.prospectId);
  // No record yet (store write racing the first poll) → treat as pending.
  return { ok: true, status: status ?? { state: "pending" } };
}
