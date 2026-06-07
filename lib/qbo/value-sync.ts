/**
 * QuickBooks lifetime-value sync.
 *
 * For every record linked to a QBO customer — a pipeline prospect/client
 * (the usual path, since billing is done directly in QuickBooks) or an
 * engagement — pull that customer's total payments received and cache it.
 * This is what the Pipeline "Value" column shows (records without a QBO
 * customer fall back to their manually-entered expected value).
 *
 * Runs as a cross-tenant system batch from two callers:
 *   - the nightly cron (`/api/cron/qbo-value-sync`)
 *   - the manual "Sync now" button on the QuickBooks settings page
 *
 * Multi-coach aware: QBO tokens are per coach (`qbo_oauth_tokens`), each
 * tied to a realm (company file). We match each record's `qbo_realm_id`
 * to the coach that owns that realm's credentials. When a record has a
 * customer id but no realm recorded, and exactly one coach is connected,
 * we fall back to that coach.
 */

import { eq, isNotNull } from "drizzle-orm";
import { engagements, prospects, qboOauthTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  getCustomerTotalPaymentsCents,
  getValidQboCredentials,
} from "@/lib/integrations/qbo";

export type QboValueSyncResult = {
  /** Records whose cached value was refreshed. */
  updated: number;
  /** Records skipped (no usable QBO credentials for their realm). */
  skipped: number;
  /** Records that errored mid-fetch (logged, non-fatal). */
  errors: number;
};

export async function syncQboLifetimeValues(): Promise<QboValueSyncResult> {
  // 1. Which coaches have QBO connected, and for which realm?
  const tokenRows = await withSystemContext(async (tx) =>
    tx
      .select({
        coachUserProfileId: qboOauthTokens.coachUserProfileId,
        realmId: qboOauthTokens.realmId,
      })
      .from(qboOauthTokens),
  );
  if (tokenRows.length === 0) {
    return { updated: 0, skipped: 0, errors: 0 };
  }

  const realmToCoach = new Map<string, string>();
  for (const t of tokenRows) {
    if (!realmToCoach.has(t.realmId)) {
      realmToCoach.set(t.realmId, t.coachUserProfileId);
    }
  }
  // Fallback coach when a record has a customer id but no realm recorded
  // and there's only one connected company file.
  const soleCoach =
    tokenRows.length === 1 ? tokenRows[0].coachUserProfileId : null;

  // Cache resolved credentials per coach so we refresh each token once.
  const credsCache = new Map<
    string,
    { accessToken: string; realmId: string } | null
  >();
  async function credsForRealm(realmId: string | null) {
    const coach = (realmId && realmToCoach.get(realmId)) || soleCoach;
    if (!coach) return null;
    if (!credsCache.has(coach)) {
      credsCache.set(coach, await getValidQboCredentials(coach));
    }
    return credsCache.get(coach) ?? null;
  }

  const totals = { updated: 0, skipped: 0, errors: 0 };

  // Generic record processor: resolve creds, fetch the customer's total
  // payments, and write it back via the supplied updater.
  async function process(
    records: Array<{
      id: string;
      qboCustomerId: string | null;
      qboRealmId: string | null;
    }>,
    write: (id: string, cents: number) => Promise<void>,
    label: string,
  ) {
    for (const rec of records) {
      if (!rec.qboCustomerId) {
        totals.skipped++;
        continue;
      }
      const creds = await credsForRealm(rec.qboRealmId);
      if (!creds) {
        totals.skipped++;
        continue;
      }
      // A customer id only means something within its own company file.
      if (rec.qboRealmId && creds.realmId !== rec.qboRealmId) {
        totals.skipped++;
        continue;
      }
      try {
        const cents = await getCustomerTotalPaymentsCents(
          creds.accessToken,
          creds.realmId,
          rec.qboCustomerId,
        );
        await write(rec.id, cents);
        totals.updated++;
      } catch (e) {
        console.error(
          `[qbo-value-sync] ${label} ${rec.id} failed:`,
          e instanceof Error ? e.message : e,
        );
        totals.errors++;
      }
    }
  }

  // Prospects/clients linked to a QBO customer (the primary path).
  const linkedProspects = await withSystemContext(async (tx) =>
    tx
      .select({
        id: prospects.id,
        qboCustomerId: prospects.qboCustomerId,
        qboRealmId: prospects.qboRealmId,
      })
      .from(prospects)
      .where(isNotNull(prospects.qboCustomerId)),
  );
  await process(
    linkedProspects,
    async (id, cents) => {
      await withSystemContext(async (tx) => {
        await tx
          .update(prospects)
          .set({
            qboLifetimePaymentsCents: cents,
            qboValueSyncedAt: new Date(),
          })
          .where(eq(prospects.id, id));
      });
    },
    "prospect",
  );

  // Engagements linked to a QBO customer (legacy path, still supported).
  const linkedEngagements = await withSystemContext(async (tx) =>
    tx
      .select({
        id: engagements.id,
        qboCustomerId: engagements.qboCustomerId,
        qboRealmId: engagements.qboRealmId,
      })
      .from(engagements)
      .where(isNotNull(engagements.qboCustomerId)),
  );
  await process(
    linkedEngagements,
    async (id, cents) => {
      await withSystemContext(async (tx) => {
        await tx
          .update(engagements)
          .set({
            qboLifetimePaymentsCents: cents,
            qboValueSyncedAt: new Date(),
          })
          .where(eq(engagements.id, id));
      });
    },
    "engagement",
  );

  return totals;
}
