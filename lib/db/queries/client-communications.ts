/**
 * Client communications — read queries.
 *
 * Three entry points:
 *   - `listForProspect` — feed for a single prospect's detail page.
 *   - `listForEngagement` — feed for the engagement's external inbox.
 *   - `listInbox` — cross-client unified inbox with optional filters.
 */

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  clientCommunications,
  engagements,
  prospects,
  userProfiles,
  type ClientCommunication,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type CommunicationRow = ClientCommunication & {
  authorName: string | null;
  prospectName: string | null;
  engagementName: string | null;
};

export async function listForProspect(
  prospectId: string,
): Promise<CommunicationRow[]> {
  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        c: clientCommunications,
        authorName: userProfiles.fullName,
        prospectName: prospects.companyName,
        engagementName: engagements.name,
      })
      .from(clientCommunications)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, clientCommunications.createdByUserProfileId),
      )
      .leftJoin(prospects, eq(prospects.id, clientCommunications.prospectId))
      .leftJoin(
        engagements,
        eq(engagements.id, clientCommunications.engagementId),
      )
      .where(eq(clientCommunications.prospectId, prospectId))
      .orderBy(desc(clientCommunications.occurredAt));
    return rows.map((r) => ({
      ...r.c,
      authorName: r.authorName,
      prospectName: r.prospectName,
      engagementName: r.engagementName,
    }));
  });
}

export async function listForEngagement(
  engagementId: string,
): Promise<CommunicationRow[]> {
  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        c: clientCommunications,
        authorName: userProfiles.fullName,
        prospectName: prospects.companyName,
        engagementName: engagements.name,
      })
      .from(clientCommunications)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, clientCommunications.createdByUserProfileId),
      )
      .leftJoin(prospects, eq(prospects.id, clientCommunications.prospectId))
      .leftJoin(
        engagements,
        eq(engagements.id, clientCommunications.engagementId),
      )
      .where(eq(clientCommunications.engagementId, engagementId))
      .orderBy(desc(clientCommunications.occurredAt));
    return rows.map((r) => ({
      ...r.c,
      authorName: r.authorName,
      prospectName: r.prospectName,
      engagementName: r.engagementName,
    }));
  });
}

export type InboxFilters = {
  q?: string;
  channel?: ClientCommunication["channel"] | null;
  direction?: ClientCommunication["direction"] | null;
  tag?: string | null;
  limit?: number;
};

/**
 * Cross-client unified inbox. Scoped to the master org (Business
 * Builders see every client's external communications) — this is a
 * coach-side surface.
 */
export async function listInbox(
  masterOrgId: string,
  filters: InboxFilters = {},
): Promise<CommunicationRow[]> {
  const limit = filters.limit ?? 200;
  return withSystemContext(async (tx) => {
    const conditions = [eq(clientCommunications.orgId, masterOrgId)];
    if (filters.q && filters.q.trim().length > 0) {
      const q = `%${filters.q.trim()}%`;
      const m = or(
        ilike(clientCommunications.subject, q),
        ilike(clientCommunications.body, q),
        ilike(clientCommunications.fromAddress, q),
      );
      if (m) conditions.push(m);
    }
    if (filters.channel) {
      conditions.push(eq(clientCommunications.channel, filters.channel));
    }
    if (filters.direction) {
      conditions.push(eq(clientCommunications.direction, filters.direction));
    }
    if (filters.tag) {
      conditions.push(
        sql`${clientCommunications.tags} && ARRAY[${filters.tag}]::text[]`,
      );
    }
    const rows = await tx
      .select({
        c: clientCommunications,
        authorName: userProfiles.fullName,
        prospectName: prospects.companyName,
        engagementName: engagements.name,
      })
      .from(clientCommunications)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, clientCommunications.createdByUserProfileId),
      )
      .leftJoin(prospects, eq(prospects.id, clientCommunications.prospectId))
      .leftJoin(
        engagements,
        eq(engagements.id, clientCommunications.engagementId),
      )
      .where(and(...conditions))
      .orderBy(desc(clientCommunications.occurredAt))
      .limit(limit);
    return rows.map((r) => ({
      ...r.c,
      authorName: r.authorName,
      prospectName: r.prospectName,
      engagementName: r.engagementName,
    }));
  });
}

/** All distinct tags in use across the master org's communications. */
export async function listKnownTags(masterOrgId: string): Promise<string[]> {
  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({ tags: clientCommunications.tags })
      .from(clientCommunications)
      .where(eq(clientCommunications.orgId, masterOrgId));
    const set = new Set<string>();
    for (const r of rows) {
      for (const t of r.tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  });
}

// keep imports live (some may go unused depending on caller mix)
void inArray;
void isNull;
