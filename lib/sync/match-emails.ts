/**
 * Email-matching guardrails for the Fireflies + Google Calendar syncs.
 *
 * Both syncs attribute a meeting to a client purely by attendee email.
 * That mis-files data whenever an email isn't unique to ONE engagement:
 *
 *   - The coach attends every client's BBS, so the coach's own email is a
 *     universal attendee — matching on it pulls every client's meetings
 *     into whichever engagement used it.
 *   - A shared/reused contact email (same bookkeeper, the same address
 *     reused across prospects) belongs to more than one engagement.
 *
 * `getEmailAttribution` returns, from one pass over the data:
 *   - `excluded`: lowercased emails that must NOT be used to attribute a
 *     meeting (every coach/master_admin email + any email mapping to >1
 *     engagement).
 *   - `uniqueEmailToEngagement`: lowercased email -> the single engagement
 *     it unambiguously belongs to (used to positively detect mis-filed
 *     rows that provably belong to a different client).
 */

import { eq } from "drizzle-orm";
import { engagements, prospects, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

const COACH_ROLES: readonly string[] = ["coach", "master_admin"];

export type EmailAttribution = {
  excluded: Set<string>;
  uniqueEmailToEngagement: Map<string, string>;
};

export async function getEmailAttribution(): Promise<EmailAttribution> {
  return withSystemContext(async (tx) => {
    const [profileRows, engRows, leadRows] = await Promise.all([
      tx
        .select({
          email: userProfiles.email,
          orgId: userProfiles.orgId,
          role: userProfiles.role,
        })
        .from(userProfiles),
      tx
        .select({ id: engagements.id, orgId: engagements.orgId })
        .from(engagements),
      tx
        .select({
          email: prospects.contactEmail,
          engId: prospects.convertedEngagementId,
        })
        .from(prospects),
    ]);

    const excluded = new Set<string>();
    for (const p of profileRows) {
      if (p.email && COACH_ROLES.includes(p.role)) {
        excluded.add(p.email.toLowerCase());
      }
    }

    const engByOrg = new Map<string, string[]>();
    for (const e of engRows) {
      const arr = engByOrg.get(e.orgId) ?? [];
      arr.push(e.id);
      engByOrg.set(e.orgId, arr);
    }

    const emailToEngagements = new Map<string, Set<string>>();
    const add = (email: string | null, engId: string | null | undefined) => {
      if (!email || !engId) return;
      const key = email.toLowerCase();
      const set = emailToEngagements.get(key) ?? new Set<string>();
      set.add(engId);
      emailToEngagements.set(key, set);
    };
    for (const m of profileRows) {
      for (const engId of engByOrg.get(m.orgId) ?? []) add(m.email, engId);
    }
    for (const l of leadRows) add(l.email, l.engId);

    const uniqueEmailToEngagement = new Map<string, string>();
    for (const [email, set] of Array.from(emailToEngagements.entries())) {
      if (set.size > 1) {
        excluded.add(email);
      } else if (!excluded.has(email)) {
        uniqueEmailToEngagement.set(email, Array.from(set)[0]);
      }
    }
    return { excluded, uniqueEmailToEngagement };
  });
}

/**
 * Client emails that are SAFE to match a single engagement on: the
 * engagement's member emails + originating lead email, minus the excluded
 * (coach / ambiguous) set. Lowercased + de-duped.
 */
export async function getEngagementMatchEmails(
  engagementId: string,
  excluded: Set<string>,
): Promise<string[]> {
  return withSystemContext(async (tx) => {
    const [eng] = await tx
      .select({ orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!eng) return [];
    const members = await tx
      .select({ email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.orgId, eng.orgId));
    const leads = await tx
      .select({ email: prospects.contactEmail })
      .from(prospects)
      .where(eq(prospects.convertedEngagementId, engagementId));
    const out = new Set<string>();
    for (const r of [...members, ...leads]) {
      const e = r.email?.toLowerCase();
      if (e && !excluded.has(e)) out.add(e);
    }
    return Array.from(out);
  });
}
