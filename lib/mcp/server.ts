/**
 * Workplaces MCP server.
 *
 * Phase 1.20. The bridge from Cowork (the Workplaces Plugin) to this
 * app's database. Cowork's Live Artifacts (My Work, Coach Dashboard,
 * BBS Prep, Pipeline, Projects) call these tools to read coach-side
 * data without going through the Next.js UI.
 *
 * Auth: bearer token. The plugin holds the secret in its config; the
 * Netlify Function (`/api/mcp`) verifies it before opening the
 * transport.
 *
 * Tenant binding: every tool resolves the coach's profile via
 * `mcp_user_profile_id` (a column on `user_profiles` would be cleaner
 * — for now we identify the coach by their `clerk_user_id` baked into
 * the bearer token's payload). System-context reads only — Cowork is
 * authoritatively the master org, so we read across all client orgs.
 *
 * Phase 1.20 ships read-only tools sufficient for the Live Artifacts.
 * Writes (create_action_item, schedule_session, post_message, …) are
 * Phase 2 once the Cowork plugin's UI is wired.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import {
  actionItems,
  bbsSessions,
  coaches,
  engagements,
  hires,
  messages,
  projects,
  subscriptionAssets,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type McpAuthContext = {
  /** Resolved by the route handler from the bearer token. */
  coachUserProfileId: string;
};

/**
 * Build a fresh MCP server instance for a single request. The server
 * is stateless across requests; the caller is identified by the
 * `auth` arg passed in by the route handler.
 */
export function createMcpServer(auth: McpAuthContext): McpServer {
  const server = new McpServer({
    name: "workplaces-mcp",
    version: "1.0.0",
  });

  /* ----------------------------- list engagements ----------------------------- */
  server.tool(
    "list_engagements",
    "List every engagement this coach owns. Returns id, name, type, status, started_at.",
    {},
    async () => {
      const rows = await withSystemContext(async (tx) => {
        const [coach] = await tx
          .select({ id: coaches.id })
          .from(coaches)
          .where(eq(coaches.userProfileId, auth.coachUserProfileId))
          .limit(1);
        if (!coach) return [];
        return tx
          .select({
            id: engagements.id,
            name: engagements.name,
            type: engagements.type,
            status: engagements.status,
            startedAt: engagements.startedAt,
            startDate: engagements.startDate,
          })
          .from(engagements)
          .where(eq(engagements.coachId, coach.id));
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    },
  );

  /* ----------------------------- list my action items ----------------------------- */
  server.tool(
    "list_my_work",
    "List every action item assigned to the coach across all engagements (the My Work Live Artifact). Sorted overdue first.",
    {},
    async () => {
      const rows = await withSystemContext(async (tx) => {
        const result = await tx
          .select({
            id: actionItems.id,
            title: actionItems.title,
            status: actionItems.status,
            dueDate: actionItems.dueDate,
            engagementId: actionItems.engagementId,
            engagementName: engagements.name,
            revenueImpact: actionItems.revenueImpact,
            marginImpact: actionItems.marginImpact,
          })
          .from(actionItems)
          .innerJoin(
            engagements,
            eq(engagements.id, actionItems.engagementId),
          )
          .where(eq(actionItems.assigneeUserProfileId, auth.coachUserProfileId));
        const now = new Date();
        return result.sort((a, b) => {
          const aOverdue = a.dueDate && a.dueDate < now ? 0 : 1;
          const bOverdue = b.dueDate && b.dueDate < now ? 0 : 1;
          if (aOverdue !== bOverdue) return aOverdue - bOverdue;
          const at = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
          const bt = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
          return at - bt;
        });
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    },
  );

  /* ----------------------------- upcoming sessions ----------------------------- */
  server.tool(
    "list_upcoming_sessions",
    "List upcoming BBS sessions across all engagements this coach owns (Coach Dashboard).",
    {},
    async () => {
      const rows = await withSystemContext(async (tx) => {
        const [coach] = await tx
          .select({ id: coaches.id })
          .from(coaches)
          .where(eq(coaches.userProfileId, auth.coachUserProfileId))
          .limit(1);
        if (!coach) return [];
        const now = new Date();
        return tx
          .select({
            id: bbsSessions.id,
            scheduledAt: bbsSessions.scheduledAt,
            type: bbsSessions.type,
            status: bbsSessions.status,
            engagementId: bbsSessions.engagementId,
            engagementName: engagements.name,
          })
          .from(bbsSessions)
          .innerJoin(
            engagements,
            eq(engagements.id, bbsSessions.engagementId),
          )
          .where(
            and(
              eq(engagements.coachId, coach.id),
              gt(bbsSessions.scheduledAt, now),
              eq(bbsSessions.status, "scheduled"),
            ),
          )
          .orderBy(asc(bbsSessions.scheduledAt));
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    },
  );

  /* ----------------------------- pipeline (hires) ----------------------------- */
  server.tool(
    "list_hiring_pipeline",
    "Every active candidate across all engagements (Hiring Pipeline cross-client Live Artifact).",
    {},
    async () => {
      const rows = await withSystemContext(async (tx) => {
        const [coach] = await tx
          .select({ id: coaches.id })
          .from(coaches)
          .where(eq(coaches.userProfileId, auth.coachUserProfileId))
          .limit(1);
        if (!coach) return [];
        return tx
          .select({
            id: hires.id,
            candidateName: hires.candidateName,
            roleName: hires.roleName,
            status: hires.status,
            engagementId: hires.engagementId,
            engagementName: engagements.name,
          })
          .from(hires)
          .innerJoin(engagements, eq(engagements.id, hires.engagementId))
          .where(eq(engagements.coachId, coach.id))
          .orderBy(desc(hires.updatedAt));
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    },
  );

  /* ----------------------------- cross-client projects ----------------------------- */
  server.tool(
    "list_projects",
    "All active projects across all engagements (Projects cross-client Live Artifact).",
    {},
    async () => {
      const rows = await withSystemContext(async (tx) => {
        const [coach] = await tx
          .select({ id: coaches.id })
          .from(coaches)
          .where(eq(coaches.userProfileId, auth.coachUserProfileId))
          .limit(1);
        if (!coach) return [];
        return tx
          .select({
            id: projects.id,
            name: projects.name,
            status: projects.status,
            targetDate: projects.targetDate,
            engagementId: projects.engagementId,
            engagementName: engagements.name,
          })
          .from(projects)
          .innerJoin(engagements, eq(engagements.id, projects.engagementId))
          .where(eq(engagements.coachId, coach.id))
          .orderBy(desc(projects.updatedAt));
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    },
  );

  /* ----------------------------- subscriptions inventory ----------------------------- */
  server.tool(
    "list_subscription_inventory",
    "Every subscription/asset Bruce maintains across all engagements (Subscriptions Inventory Live Artifact).",
    {},
    async () => {
      const rows = await withSystemContext(async (tx) => {
        const [coach] = await tx
          .select({ id: coaches.id })
          .from(coaches)
          .where(eq(coaches.userProfileId, auth.coachUserProfileId))
          .limit(1);
        if (!coach) return [];
        return tx
          .select({
            id: subscriptionAssets.id,
            name: subscriptionAssets.name,
            vendor: subscriptionAssets.vendor,
            monthlyCostCents: subscriptionAssets.monthlyCostCents,
            currency: subscriptionAssets.currency,
            paidBy: subscriptionAssets.paidBy,
            model: subscriptionAssets.model,
            transferStatus: subscriptionAssets.transferStatus,
            renewalDate: subscriptionAssets.renewalDate,
            engagementId: subscriptionAssets.engagementId,
            engagementName: engagements.name,
          })
          .from(subscriptionAssets)
          .innerJoin(
            engagements,
            eq(engagements.id, subscriptionAssets.engagementId),
          )
          .where(eq(engagements.coachId, coach.id));
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    },
  );

  /* ----------------------------- BBS prep ----------------------------- */
  server.tool(
    "get_bbs_prep",
    "Fetch the prep context for a specific BBS session: the session itself, the engagement, the prior session's notes (if any), and any open action items in the engagement.",
    { sessionId: z.string().uuid() },
    async ({ sessionId }) => {
      const result = await withSystemContext(async (tx) => {
        const [session] = await tx
          .select()
          .from(bbsSessions)
          .where(eq(bbsSessions.id, sessionId))
          .limit(1);
        if (!session) return null;
        const [engagement] = await tx
          .select()
          .from(engagements)
          .where(eq(engagements.id, session.engagementId))
          .limit(1);

        const [priorSession] = await tx
          .select()
          .from(bbsSessions)
          .where(
            and(
              eq(bbsSessions.engagementId, session.engagementId),
              eq(bbsSessions.status, "completed"),
            ),
          )
          .orderBy(desc(bbsSessions.scheduledAt))
          .limit(1);

        const openActionItems = await tx
          .select({
            id: actionItems.id,
            title: actionItems.title,
            status: actionItems.status,
            dueDate: actionItems.dueDate,
          })
          .from(actionItems)
          .where(
            and(
              eq(actionItems.engagementId, session.engagementId),
              // not done, not draft
            ),
          );

        return {
          session,
          engagement,
          priorSession: priorSession ?? null,
          openActionItems: openActionItems.filter(
            (a) => a.status !== "done" && a.status !== "draft",
          ),
        };
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  /* ----------------------------- WRITE TOOLS (Phase 4) ----------------------------- */

  server.tool(
    "create_action_item",
    "Create a published action item on an engagement. Assignee defaults to the calling coach if omitted. Returns the new id.",
    {
      engagementId: z.string().uuid(),
      title: z.string().min(1).max(500),
      description: z.string().max(20000).optional(),
      dueDate: z
        .string()
        .datetime()
        .optional()
        .describe("ISO 8601 timestamp"),
      assigneeUserProfileId: z.string().uuid().optional(),
      revenueImpact: z.boolean().default(false),
      marginImpact: z.boolean().default(false),
    },
    async ({
      engagementId,
      title,
      description,
      dueDate,
      assigneeUserProfileId,
      revenueImpact,
      marginImpact,
    }) => {
      const result = await withSystemContext(async (tx) => {
        const [eng] = await tx
          .select({ id: engagements.id, orgId: engagements.orgId })
          .from(engagements)
          .where(eq(engagements.id, engagementId))
          .limit(1);
        if (!eng) throw new Error("Engagement not found.");
        const [row] = await tx
          .insert(actionItems)
          .values({
            orgId: eng.orgId,
            engagementId: eng.id,
            title,
            description: description ?? null,
            status: "open",
            dueDate: dueDate ? new Date(dueDate) : null,
            assigneeUserProfileId:
              assigneeUserProfileId ?? auth.coachUserProfileId,
            createdBy: "coach",
            revenueImpact,
            marginImpact,
          })
          .returning({ id: actionItems.id });
        return row;
      });
      return {
        content: [
          { type: "text", text: JSON.stringify({ id: result.id }, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "schedule_session",
    "Schedule a BBS session on an engagement. Returns the new session id.",
    {
      engagementId: z.string().uuid(),
      scheduledAt: z
        .string()
        .datetime()
        .describe("ISO 8601 timestamp (UTC) for the session start"),
      type: z.enum(["in_person", "virtual"]),
      notes: z.string().max(40000).optional(),
    },
    async ({ engagementId, scheduledAt, type, notes }) => {
      const result = await withSystemContext(async (tx) => {
        const [eng] = await tx
          .select({ id: engagements.id, orgId: engagements.orgId })
          .from(engagements)
          .where(eq(engagements.id, engagementId))
          .limit(1);
        if (!eng) throw new Error("Engagement not found.");
        const [row] = await tx
          .insert(bbsSessions)
          .values({
            orgId: eng.orgId,
            engagementId: eng.id,
            scheduledAt: new Date(scheduledAt),
            type,
            status: "scheduled",
            notes: notes ?? null,
            createdByUserProfileId: auth.coachUserProfileId,
          })
          .returning({ id: bbsSessions.id });
        return row;
      });
      return {
        content: [
          { type: "text", text: JSON.stringify({ id: result.id }, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "post_message",
    "Post a message to an engagement thread (engagement_leadership / engagement_team / action_item). Returns the new message id.",
    {
      engagementId: z.string().uuid(),
      threadType: z.enum([
        "engagement_leadership",
        "engagement_team",
        "action_item",
      ]),
      parentEntityId: z
        .string()
        .uuid()
        .describe(
          "For engagement_* threads, the engagement id. For action_item, the action_item id.",
        ),
      body: z.string().min(1).max(40000),
    },
    async ({ engagementId, threadType, parentEntityId, body }) => {
      const result = await withSystemContext(async (tx) => {
        const [eng] = await tx
          .select({ id: engagements.id, orgId: engagements.orgId })
          .from(engagements)
          .where(eq(engagements.id, engagementId))
          .limit(1);
        if (!eng) throw new Error("Engagement not found.");
        const [row] = await tx
          .insert(messages)
          .values({
            orgId: eng.orgId,
            engagementId: eng.id,
            authorUserProfileId: auth.coachUserProfileId,
            parentEntityType: threadType,
            parentEntityId,
            body,
          })
          .returning({ id: messages.id });
        return row;
      });
      return {
        content: [
          { type: "text", text: JSON.stringify({ id: result.id }, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "complete_action_item",
    "Mark an action item as done. Use when the coach reports completion via Cowork.",
    { actionItemId: z.string().uuid() },
    async ({ actionItemId }) => {
      await withSystemContext(async (tx) => {
        await tx
          .update(actionItems)
          .set({ status: "done" })
          .where(eq(actionItems.id, actionItemId));
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    },
  );

  /* ----------------------------- recent activity ----------------------------- */
  server.tool(
    "list_recent_activity",
    "Latest N messages across every engagement this coach owns (Coach Dashboard feed).",
    { limit: z.number().int().min(1).max(50).default(10) },
    async ({ limit }) => {
      const rows = await withSystemContext(async (tx) => {
        const [coach] = await tx
          .select({ id: coaches.id })
          .from(coaches)
          .where(eq(coaches.userProfileId, auth.coachUserProfileId))
          .limit(1);
        if (!coach) return [];
        return tx
          .select({
            id: messages.id,
            authorName: userProfiles.fullName,
            body: messages.body,
            createdAt: messages.createdAt,
            engagementId: messages.engagementId,
            engagementName: engagements.name,
            parentEntityType: messages.parentEntityType,
            parentEntityId: messages.parentEntityId,
          })
          .from(messages)
          .innerJoin(engagements, eq(engagements.id, messages.engagementId))
          .innerJoin(
            userProfiles,
            eq(userProfiles.id, messages.authorUserProfileId),
          )
          .where(eq(engagements.coachId, coach.id))
          .orderBy(desc(messages.createdAt))
          .limit(limit);
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(rows, null, 2) },
        ],
      };
    },
  );

  return server;
}
