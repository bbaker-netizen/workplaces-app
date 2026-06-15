"use server";

/**
 * On-demand "Sync now" for the signed-in Business Builder — runs the same
 * core as the scheduled job but only for the current coach, so they get
 * immediate feedback instead of waiting for the half-hourly cron.
 */

import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { syncCoachCalendar, type CalendarSyncResult } from "@/lib/calendar/sync";

export type SyncNowResult =
  | { ok: true; result: CalendarSyncResult }
  | { ok: false; error: string };

export async function syncMyCalendarNow(): Promise<SyncNowResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "You're not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only Business Builders can sync calendars." };
  }
  try {
    const result = await syncCoachCalendar(profile.userProfileId);
    revalidatePath("/business-builder/calendar");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
