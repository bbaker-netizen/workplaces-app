/**
 * Gmail sync orchestration — the bit that pulls the watermark, calls
 * the Gmail client, and writes the watermark forward. Separated from
 * gmail.ts so server actions and the cron route share one entry point.
 */

import { eq } from "drizzle-orm";
import {
  googleCalendarTokens,
  orgs,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import { syncUserGmail } from "./gmail";

// First-sync depth: how far back to scan when there's no watermark yet
// (a brand-new connection). 90 days so recent history — months of threads
// with a contact — is captured on the first run, not just the last fortnight.
// Once the watermark is set, syncs are incremental from there.
const DEFAULT_LOOKBACK_DAYS = 90;

export type SyncSummary = {
  userProfileId: string;
  scanned: number;
  captured: number;
  lastMessageAt: Date | null;
  ranAt: Date;
  ok: boolean;
  error?: string;
};

/**
 * Run a sync for one user. Reads the watermark, calls Gmail, writes the
 * watermark forward. Safe to call repeatedly.
 */
export async function syncOneUser(
  userProfileId: string,
): Promise<SyncSummary> {
  const ranAt = new Date();
  try {
    const row = await withSystemContext(async (tx) => {
      const [r] = await tx
        .select({
          orgId: googleCalendarTokens.orgId,
          gmailSyncEnabled: googleCalendarTokens.gmailSyncEnabled,
          gmailLastMessageAt: googleCalendarTokens.gmailLastMessageAt,
        })
        .from(googleCalendarTokens)
        .where(eq(googleCalendarTokens.userProfileId, userProfileId))
        .limit(1);
      return r ?? null;
    });
    if (!row) {
      return {
        userProfileId,
        scanned: 0,
        captured: 0,
        lastMessageAt: null,
        ranAt,
        ok: false,
        error: "Google not connected.",
      };
    }
    if (!row.gmailSyncEnabled) {
      return {
        userProfileId,
        scanned: 0,
        captured: 0,
        lastMessageAt: row.gmailLastMessageAt ?? null,
        ranAt,
        ok: true,
      };
    }

    // The user's tokens live in their own (master) org; the inbox query
    // and the prospects/engagements lookup are master-org scoped. row.orgId
    // is the user's home org which is the master.
    const masterOrgId = await resolveMasterOrgId();
    const since =
      row.gmailLastMessageAt ??
      new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const summary = await syncUserGmail({
      userProfileId,
      masterOrgId,
      since,
    });

    // Push the watermark forward only if we actually saw newer mail.
    const nextWatermark =
      summary.latestAt && summary.latestAt > since
        ? summary.latestAt
        : since;
    await withTenantContext(row.orgId, async (tx) => {
      await tx
        .update(googleCalendarTokens)
        .set({
          gmailLastSyncedAt: ranAt,
          gmailLastMessageAt: nextWatermark,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarTokens.userProfileId, userProfileId));
    });

    return {
      userProfileId,
      scanned: summary.scanned,
      captured: summary.captured,
      lastMessageAt: nextWatermark,
      ranAt,
      ok: true,
    };
  } catch (e) {
    return {
      userProfileId,
      scanned: 0,
      captured: 0,
      lastMessageAt: null,
      ranAt,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Walk every user with Gmail sync enabled and sync each in turn. Used
 * by the scheduled cron route at /api/cron/gmail-sync.
 */
export async function syncAllUsers(): Promise<SyncSummary[]> {
  const rows = await withSystemContext(async (tx) => {
    return tx
      .select({ userProfileId: googleCalendarTokens.userProfileId })
      .from(googleCalendarTokens)
      .where(eq(googleCalendarTokens.gmailSyncEnabled, true));
  });
  const out: SyncSummary[] = [];
  for (const r of rows) {
    const s = await syncOneUser(r.userProfileId);
    out.push(s);
  }
  return out;
}

async function resolveMasterOrgId(): Promise<string> {
  const row = await withSystemContext(async (tx) => {
    const [m] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    return m ?? null;
  });
  if (!row) {
    throw new Error("No master org configured.");
  }
  return row.id;
}
