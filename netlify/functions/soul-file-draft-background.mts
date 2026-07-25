/**
 * Background: draft a prospect's Soul File from their Fireflies transcripts.
 *
 * The `-background` suffix gives this a 15-minute budget (vs Netlify's ~26s
 * synchronous ceiling). Paginating up to 400 Fireflies transcripts, pulling
 * three full ones, and running a big Claude call blows past a normal request
 * — that timeout is what produced the "took too long" error on the prospect's
 * Soul File draft button. Triggered by the `startSoulFileDraft` server action,
 * guarded by Bearer CRON_SECRET. Writes the result to the Blobs draft store;
 * the drawer polls for it.
 */

import {
  runSoulFileDraftForProspect,
  SoulFileDraftError,
} from "../../lib/soul-files/preview-core";
import { setSoulFileDraftStatus } from "../../lib/soul-files/draft-store";

export default async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("soul-file-draft-background: CRON_SECRET not set.");
    return new Response("Not configured", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let prospectId: string | undefined;
  try {
    const body = (await req.json()) as { prospectId?: string };
    prospectId = body.prospectId;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!prospectId) return new Response("Missing prospectId", { status: 400 });

  try {
    const data = await runSoulFileDraftForProspect(prospectId);
    await setSoulFileDraftStatus(prospectId, {
      state: "ready",
      ...data,
      finishedAt: Date.now(),
    });
    console.log(
      `soul-file-draft-background: drafted for prospect ${prospectId} from ${data.transcriptCount} transcript(s).`,
    );
  } catch (e) {
    // SoulFileDraftError carries an operator-facing message; anything else is
    // an unexpected failure we still surface (trimmed) rather than hang the UI.
    const msg =
      e instanceof SoulFileDraftError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    await setSoulFileDraftStatus(prospectId, {
      state: "error",
      error: msg,
      finishedAt: Date.now(),
    }).catch((se) =>
      console.error("soul-file-draft-background: couldn't store error:", se),
    );
    console.error(
      `soul-file-draft-background: failed for prospect ${prospectId}:`,
      msg,
    );
  }
};
