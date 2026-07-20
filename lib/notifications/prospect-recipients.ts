/**
 * Who hears about a prospect.
 *
 * One rule, used by every prospect-scoped notification path (new lead,
 * gone quiet, follow-up due) so the three can't drift apart:
 *
 *   - Owned prospect  → the owner, and only the owner.
 *   - Unowned prospect → the master admin(s) — the triage inbox.
 *
 * Before there was a second Business Builder, unowned prospects fanned
 * out to EVERY internal user, which was harmless when "everyone" meant
 * one person. With a team it means each Business Builder's bell fills
 * with the other's work. Routing unowned leads to the triage inbox
 * keeps one person accountable for claiming them and leaves everyone
 * else's notifications about their own clients.
 *
 * Fallback: if the org somehow has no master_admin, fall back to every
 * internal user rather than nobody. A noisy notification is recoverable;
 * an inbound lead that notifies no one is lost revenue.
 */

import { and, eq, inArray } from "drizzle-orm";
import { userProfiles } from "@/lib/db/schema";
import type { Tx } from "@/lib/db/tenant";

export type ProspectRecipient = {
  id: string;
  email: string;
  fullName: string;
};

/**
 * Every internal user in `orgId`, split by role.
 *
 * IMPORTANT: always filter on `orgId`. These queries run under
 * `withSystemContext` (RLS off), so a role-only predicate would match
 * `coach` / `master_admin` rows in ANY org — including a client org
 * that had a mis-assigned role — and leak the practice's lead flow to
 * them via email and in-app notifications.
 */
export async function loadInternalUsers(
  tx: Tx,
  orgId: string,
): Promise<{ all: ProspectRecipient[]; masterAdmins: ProspectRecipient[] }> {
  const rows = await tx
    .select({
      id: userProfiles.id,
      email: userProfiles.email,
      fullName: userProfiles.fullName,
      role: userProfiles.role,
    })
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.orgId, orgId),
        inArray(userProfiles.role, ["master_admin", "coach"]),
      ),
    );

  return {
    all: rows.map(({ id, email, fullName }) => ({ id, email, fullName })),
    masterAdmins: rows
      .filter((r) => r.role === "master_admin")
      .map(({ id, email, fullName }) => ({ id, email, fullName })),
  };
}

/**
 * Recipients for a notification about one prospect.
 *
 * `internal` comes from `loadInternalUsers` — hoisted by the caller so a
 * cron sweeping hundreds of prospects loads the directory once rather
 * than per row.
 */
export function recipientsForProspect(
  ownerUserProfileId: string | null,
  internal: { all: ProspectRecipient[]; masterAdmins: ProspectRecipient[] },
): ProspectRecipient[] {
  if (ownerUserProfileId) {
    const owner = internal.all.find((u) => u.id === ownerUserProfileId);
    // Owner resolved → them alone. If the owner id doesn't match an
    // internal user (stale row, since-removed teammate) fall through to
    // triage rather than notifying nobody.
    if (owner) return [owner];
  }
  return internal.masterAdmins.length > 0
    ? internal.masterAdmins
    : internal.all;
}

/** Convenience for the id-only call sites. */
export function recipientIdsForProspect(
  ownerUserProfileId: string | null,
  internal: { all: ProspectRecipient[]; masterAdmins: ProspectRecipient[] },
): string[] {
  return recipientsForProspect(ownerUserProfileId, internal).map((r) => r.id);
}
