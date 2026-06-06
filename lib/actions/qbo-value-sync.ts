"use server";

/**
 * Manual trigger for the QuickBooks lifetime-value sync — wired to the
 * "Sync now" button on the QuickBooks settings page. Lets a coach
 * populate the Pipeline "Value" column on demand right after connecting,
 * rather than waiting for the nightly cron.
 */

import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { syncQboLifetimeValues } from "@/lib/qbo/value-sync";

export type SyncQboValuesResult =
  | { ok: true; updated: number; skipped: number; errors: number }
  | { ok: false; error: string };

export async function syncQboLifetimeValuesAction(): Promise<SyncQboValuesResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    const r = await syncQboLifetimeValues();
    revalidatePath("/business-builder/pipeline");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
