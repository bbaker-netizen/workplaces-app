"use server";

/**
 * Global search.
 *
 * Phase 3.12. One server action that searches across action items,
 * goals, projects, deliverables, hires, documents, sessions, and
 * messages by ILIKE on the title/body/name field. For Coach users,
 * spans every engagement they own; for client users, scoped to
 * their home org via RLS.
 *
 * Phase 4 may upgrade this to Postgres FTS or vector search across
 * all entities (the Soul File embedding approach generalized).
 */

import { ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  actionItems,
  bbsSessions,
  deliverables,
  documents,
  engagements,
  goals,
  hires,
  messages,
  projects,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import { canViewThread } from "@/lib/communication/audience";

export type GlobalSearchHit = {
  type:
    | "action_item"
    | "goal"
    | "project"
    | "deliverable"
    | "hire"
    | "document"
    | "session"
    | "message";
  id: string;
  title: string;
  excerpt: string | null;
  engagementId: string;
  href: string;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const inputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
});

export async function globalSearch(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult<{ hits: GlobalSearchHit[] }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const q = `%${parsed.data.query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const limit = parsed.data.limit;

  const isCoach =
    profile.role === "master_admin" || profile.role === "coach";

  const runSearch = async (tx: Parameters<Parameters<typeof withTenantContext<unknown>>[1]>[0]) => {
    const [
      itemHits,
      goalHits,
      projHits,
      delivHits,
      hireHits,
      docHits,
      sessHits,
      msgHits,
    ] = await Promise.all([
      tx
        .select({
          id: actionItems.id,
          title: actionItems.title,
          description: actionItems.description,
          engagementId: actionItems.engagementId,
        })
        .from(actionItems)
        .where(
          or(
            ilike(actionItems.title, q),
            ilike(actionItems.description, q),
          ),
        )
        .limit(limit),
      tx
        .select({
          id: goals.id,
          title: goals.title,
          description: goals.description,
          engagementId: goals.engagementId,
        })
        .from(goals)
        .where(or(ilike(goals.title, q), ilike(goals.description, q)))
        .limit(limit),
      tx
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          engagementId: projects.engagementId,
        })
        .from(projects)
        .where(or(ilike(projects.name, q), ilike(projects.description, q)))
        .limit(limit),
      tx
        .select({
          id: deliverables.id,
          title: deliverables.title,
          description: deliverables.description,
          engagementId: deliverables.engagementId,
        })
        .from(deliverables)
        .where(
          or(
            ilike(deliverables.title, q),
            ilike(deliverables.description, q),
          ),
        )
        .limit(limit),
      tx
        .select({
          id: hires.id,
          candidateName: hires.candidateName,
          roleName: hires.roleName,
          engagementId: hires.engagementId,
        })
        .from(hires)
        .where(or(ilike(hires.candidateName, q), ilike(hires.roleName, q)))
        .limit(limit),
      tx
        .select({
          id: documents.id,
          originalFilename: documents.originalFilename,
          engagementId: documents.engagementId,
        })
        .from(documents)
        .where(ilike(documents.originalFilename, q))
        .limit(limit),
      tx
        .select({
          id: bbsSessions.id,
          notes: bbsSessions.notes,
          engagementId: bbsSessions.engagementId,
        })
        .from(bbsSessions)
        .where(ilike(bbsSessions.notes, q))
        .limit(limit),
      tx
        .select({
          id: messages.id,
          body: messages.body,
          engagementId: messages.engagementId,
          parentEntityType: messages.parentEntityType,
          parentEntityId: messages.parentEntityId,
        })
        .from(messages)
        .where(ilike(messages.body, q))
        .limit(limit),
    ]);

    const hits: GlobalSearchHit[] = [];
    for (const r of itemHits) {
      hits.push({
        type: "action_item",
        id: r.id,
        title: r.title,
        excerpt: r.description?.slice(0, 200) ?? null,
        engagementId: r.engagementId,
        href: `/portal/action-items/${r.id}`,
      });
    }
    for (const r of goalHits) {
      hits.push({
        type: "goal",
        id: r.id,
        title: r.title,
        excerpt: r.description?.slice(0, 200) ?? null,
        engagementId: r.engagementId,
        href: `/portal/goals/${r.id}`,
      });
    }
    for (const r of projHits) {
      hits.push({
        type: "project",
        id: r.id,
        title: r.name,
        excerpt: r.description?.slice(0, 200) ?? null,
        engagementId: r.engagementId,
        href: `/portal/projects/${r.id}`,
      });
    }
    for (const r of delivHits) {
      hits.push({
        type: "deliverable",
        id: r.id,
        title: r.title,
        excerpt: r.description?.slice(0, 200) ?? null,
        engagementId: r.engagementId,
        href: `/portal/deliverables`,
      });
    }
    for (const r of hireHits) {
      hits.push({
        type: "hire",
        id: r.id,
        title: r.candidateName,
        excerpt: r.roleName,
        engagementId: r.engagementId,
        href: `/portal/hiring/${r.id}`,
      });
    }
    for (const r of docHits) {
      // Documents tied directly to a prospect (no engagement) skip
      // here since the search surface is engagement-scoped.
      if (!r.engagementId) continue;
      hits.push({
        type: "document",
        id: r.id,
        title: r.originalFilename,
        excerpt: null,
        engagementId: r.engagementId,
        href: `/api/documents/${r.id}/download`,
      });
    }
    for (const r of sessHits) {
      hits.push({
        type: "session",
        id: r.id,
        title: "Session notes",
        excerpt: r.notes?.slice(0, 200) ?? null,
        engagementId: r.engagementId,
        href: `/portal/sessions/${r.id}`,
      });
    }
    for (const r of msgHits) {
      // Audience wall: don't surface leadership-thread messages to roles
      // that can't see that thread (e.g. a client_employee). Mirrors the
      // filter listEngagementRecentActivity applies; RLS only scopes by
      // org, not by within-engagement thread audience.
      if (!canViewThread(r.parentEntityType, profile.role)) continue;
      hits.push({
        type: "message",
        id: r.id,
        title: "Message",
        excerpt: r.body.slice(0, 200),
        engagementId: r.engagementId,
        href:
          r.parentEntityType === "action_item"
            ? `/portal/action-items/${r.parentEntityId}`
            : `/portal/communication`,
      });
    }
    return hits;
  };

  try {
    let hits: GlobalSearchHit[];
    if (isCoach) {
      // System context — coaches search across every tenant they own.
      hits = await withSystemContext(async (tx) => {
        const all = await runSearch(tx);
        // Filter to engagements this Coach owns. Re-querying is cheap.
        const engs = await tx
          .select({ id: engagements.id })
          .from(engagements)
          .where(sql`engagements.coach_id IN (
            SELECT id FROM coaches WHERE user_profile_id = ${profile.userProfileId}
          )`);
        const allowed = new Set(engs.map((e) => e.id));
        return all.filter((h) => allowed.has(h.engagementId));
      });
    } else {
      // Client roles: tenant-scoped via RLS.
      hits = await withTenantContext(profile.orgId, runSearch);
    }
    return { ok: true, data: { hits } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
