/**
 * QuickBooks lifetime-value sync.
 *
 * For every engagement linked to a QBO customer, pull that customer's
 * total payments received and cache it on
 * `engagements.qbo_lifetime_payments_cents`. This is what the Pipeline
 * "Value" column shows for clients (prospects without a QBO customer fall
 * back to their manually-entered expected value).
 *
 * Runs as a cross-tenant system batch from two callers:
 *   - the nightly cron (`/api/cron/qbo-value-sync`)
 *   - the manual "Sync now" button on the QuickBooks settings page
 *
 * Multi-coach aware: QBO tokens are per coach (`qbo_oauth_tokens`), each
 * tied to a realm (company file). We match each engagement's
 * `qbo_realm_id` to the coach that owns that realm's credentials. When an
 * engagement has a customer id but no realm recorded, and exactly one
 * coach is connected, we fall back to that coach.
 */

import { eq, isNotNull } from "drizzle-orm";
import { engagements, qboOauthTokens } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  getCustomerTotalPaymentsCents,
  getValidQboCredentials,
} from "@/lib/integrations/qbo";

export type QboValueSyncResult = {
  /** Engagements whose cached value was refreshed. */
  updated: number;
  /** Engagements skipped (no usable QBO credentials for their realm). */
  skipped: number;
  /** Engagements that errored mid-fetch (logged, non-fatal). */
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
  // Fallback coach when an engagement has a customer id but no realm and
  // there's only one connected company file.
  const soleCoach =
    tokenRows.length === 1 ? tokenRows[0].coachUserProfileId : null;

  // 2. Engagements linked to a QBO customer.
  const linked = await withSystemContext(async (tx) =>
    tx
      .select({
        id: engagements.id,
        qboCustomerId: engagements.qboCustomerId,
        qboRealmId: engagements.qboRealmId,
      })
      .from(engagements)
      .where(isNotNull(engagements.qboCustomerId)),
  );

  // 3. Cache resolved credentials per coach so we refresh each token once.
  const credsCache = new Map<
    string,
    { accessToken: string; realmId: string } | null
  >();
  async function credsForEngagement(realmId: string | null) {
    const coach = (realmId && realmToCoach.get(realmId)) || soleCoach;
    if (!coach) return null;
    if (!credsCache.has(coach)) {
      credsCache.set(coach, await getValidQboCredentials(coach));
    }
    return credsCache.get(coach) ?? null;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const eng of linked) {
    if (!eng.qboCustomerId) {
      skipped++;
      continue;
    }
    const creds = await credsForEngagement(eng.qboRealmId);
    if (!creds) {
      skipped++;
      continue;
    }
    // A customer id only means something within its own company file.
    // If the engagement names a realm that doesn't match the credentials
    // we resolved, skip rather than query the wrong books.
    if (eng.qboRealmId && creds.realmId !== eng.qboRealmId) {
      skipped++;
      continue;
    }
    try {
      const cents = await getCustomerTotalPaymentsCents(
        creds.accessToken,
        creds.realmId,
        eng.qboCustomerId,
      );
      await withSystemContext(async (tx) => {
        await tx
          .update(engagements)
          .set({
            qboLifetimePaymentsCents: cents,
            qboValueSyncedAt: new Date(),
          })
          .where(eq(engagements.id, eng.id));
      });
      updated++;
    } catch (e) {
      console.error(
        `[qbo-value-sync] engagement ${eng.id} failed:`,
        e instanceof Error ? e.message : e,
      );
      errors++;
    }
  }

  return { updated, skipped, errors };
}
