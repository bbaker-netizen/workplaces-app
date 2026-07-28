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
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    const result = await syncMeetingsCore(engagementId);
    revalidatePath(`/business-builder/engagements/${engagementId}`);
    revalidatePath(`/business-builder/engagements/${engagementId}/meetings`);
    revalidatePath("/portal/meetings");
    return result;
  } catch (e) {
    // Never throw to the page (would show the generic error boundary).
    console.error("[fireflies-sync] failed for", engagementId, e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Sync failed unexpectedly.",
    };
  }
}
