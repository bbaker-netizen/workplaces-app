"use server";

/**
 * Manual "Sync meetings" button — the Clerk-guarded wrapper.
 *
 * The work itself lives in `lib/integrations/fireflies-sync.ts`, which is
 * deliberately session-free so the hourly cron can call it. This file is
 * only the authorization boundary for the in-app button, plus the cache
 * revalidation that a browser-initiated sync needs and a cron does not.
 *
 * **Do not call anything in here from a scheduled job.** Every function
 * below reads the Clerk session via `ensureUserProfile()`, and a cron run
 * has no session — the guard fails, the function returns an empty result,
 * and the job reports success having done nothing. That is exactly what
 * happened to the hourly Fireflies sync between 24 and 28 July 2026: the
 * cron called the guarded all-engagements function, got "0 engagements"
 * in a few milliseconds every hour, and session recaps silently never
 * arrived. Import `syncAllEngagementMeetingsAsSystem` instead.
 */

import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  syncMeetingsCore,
  type SyncResult,
} from "@/lib/integrations/fireflies-sync";

// Note: no type re-export. Next.js requires EVERY export of a
// `"use server"` module to be an async function, so consumers that need
// `SyncResult` import it from `@/lib/integrations/fireflies-sync`.

export async function syncEngagementMeetings(
  engagementId: string,
): Promise<SyncResult> {
  // EVERYTHING inside the try, `ensureUserProfile()` included. It sat
  // outside, so a failure resolving the session threw straight out of the
  // action and the browser got "This page hit a snag" — a message that
  // names neither the step nor the reason, and looks identical whether
  // Fireflies is down, the key is missing, or the session expired.
  try {
    const profile = await ensureUserProfile();
    if (profile.status !== "ok")
      return { ok: false, error: "Not authenticated." };
    if (profile.role !== "master_admin" && profile.role !== "coach") {
      return { ok: false, error: "Business Builders only." };
    }
    const result = await syncMeetingsCore(engagementId);
    revalidatePath(`/business-builder/engagements/${engagementId}`);
    revalidatePath(`/business-builder/engagements/${engagementId}/meetings`);
    revalidatePath("/portal/meetings");
    return result;
  } catch (e) {
    // Never throw to the page (would show the generic error boundary).
    console.error("[fireflies-sync] failed for", engagementId, e);
    return { ok: false, error: describeSyncFailure(e) };
  }
}

/**
 * Turn whatever came back into a sentence naming the actual problem.
 *
 * "Sync failed unexpectedly" is the same message whether the key expired,
 * Fireflies rate-limited us, or the session dropped — and each needs a
 * different person to do a different thing. Raw errors are logged in full;
 * this is what the operator reads.
 */
function describeSyncFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/FIREFLIES_API_KEY not configured/i.test(raw)) {
    return "Fireflies isn't connected — FIREFLIES_API_KEY is missing from the site's environment variables. That's a master-admin setup step, not something to retry.";
  }
  if (/\(401\)|\(403\)|unauthor|forbidden|invalid.*(key|token)/i.test(raw)) {
    return "Fireflies rejected our API key. It has most likely been rotated or revoked — generate a new one in Fireflies (Settings, Developer Portal) and update FIREFLIES_API_KEY.";
  }
  if (/\(429\)|rate limit|too many requests/i.test(raw)) {
    return "Fireflies is rate-limiting us. Nothing is broken — wait a few minutes and sync again.";
  }
  if (/\(5\d\d\)|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(raw)) {
    return `Couldn't reach Fireflies (${raw}). Their API is likely having a moment — try again shortly.`;
  }
  return `Sync failed: ${raw}`;
}
